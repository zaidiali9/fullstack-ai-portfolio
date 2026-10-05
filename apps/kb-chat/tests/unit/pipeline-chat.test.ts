import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { buildPdf } from "../../drizzle/seed-files";
import { db, schema } from "@/db";
import { ask, getConversation, listConversations, questionsThisMonth } from "@/server/chat";
import { deleteDocument, getChunk, listDocuments, retryDocument, uploadFile } from "@/server/documents";
import { claimNextJob, runJobs } from "@/server/ingest/pipeline";
import { retrieve } from "@/server/rag/retrieve";
import { file, team } from "./factories";

// AI_PROVIDER=stub (vitest.config): deterministic, labeled stub chat + bag-of-words embeddings.

const drain = async (gen: AsyncGenerator<string, unknown>) => {
  let text = "";
  let r = await gen.next();
  while (!r.done) {
    text += r.value;
    r = await gen.next();
  }
  return { text, meta: r.value as { content: string; status: string; citations: { title: string; method?: string }[] } };
};

describe("ingestion pipeline (stub embeddings, real parsers, PGlite)", () => {
  it("uploads, queues, processes and deletes the raw blob", async () => {
    const t = await team();
    const doc = await uploadFile(t.editor, file("vacation.md", "# Vacation\n\nEmployees receive 25 vacation days per year, accrued monthly.\n\n# Sick leave\n\nTen paid sick days per year."));
    expect(doc.status).toBe("queued");
    expect((await runJobs()).processed).toBe(1);
    const [fresh] = await db.select().from(schema.documents).where(eq(schema.documents.id, doc.id));
    expect(fresh).toMatchObject({ status: "ready", chunkCount: 2 });
    expect(await db.select().from(schema.documentBlobs).where(eq(schema.documentBlobs.documentId, doc.id))).toHaveLength(0);
    const chunks = await db.select().from(schema.chunks).where(eq(schema.chunks.documentId, doc.id));
    expect(chunks.every((c) => Array.isArray(c.embedding) && c.embedding.length === 384)).toBe(true);
    const [job] = await db.select().from(schema.ingestionJobs).where(eq(schema.ingestionJobs.documentId, doc.id));
    expect(job!.status).toBe("done");
  });

  it("indexes PDFs with page numbers", async () => {
    const t = await team();
    const pdf = await buildPdf("Policy\nnote\n\nBooking\nBook trips 14 days ahead in TravelDesk.\n\nMeals\nThe domestic per diem is $60 per day.");
    const doc = await uploadFile(t.owner, file("policy.pdf", pdf, "application/pdf"));
    await runJobs();
    const chunks = await db.select({ page: schema.chunks.page, content: schema.chunks.content }).from(schema.chunks).where(eq(schema.chunks.documentId, doc.id));
    expect(chunks.find((c) => c.content.includes("$60"))!.page).toBe(2);
  });

  it("rejects duplicates and enforces the document limit", async () => {
    const t = await team({ maxDocuments: 2 });
    await uploadFile(t.editor, file("a.md", "Alpha document content here."));
    await expect(uploadFile(t.editor, file("copy.md", "Alpha document content here."))).rejects.toMatchObject({ status: 409 });
    await uploadFile(t.editor, file("b.md", "Beta document content here."));
    await expect(uploadFile(t.editor, file("c.md", "Gamma document content here."))).rejects.toMatchObject({ status: 403, code: "document_limit" });
  });

  it("fails permanently on unreadable content and allows a manual retry", async () => {
    const t = await team();
    const doc = await uploadFile(t.editor, file("empty.md", "# Only a heading"));
    const r = await runJobs();
    expect(r.failed).toBe(1);
    const [fresh] = await db.select().from(schema.documents).where(eq(schema.documents.id, doc.id));
    expect(fresh).toMatchObject({ status: "failed", error: expect.stringMatching(/No readable text/) });
    await retryDocument(t.editor, doc.id);
    expect((await listDocuments(t.ws.id))[0]!.status).toBe("queued");
  });

  it("recovers jobs whose worker died (stale lock) and never double-claims", async () => {
    await db.delete(schema.ingestionJobs); // isolate from jobs queued by earlier tests in this file
    const t = await team();
    const doc = await uploadFile(t.editor, file("x.md", "Some text that is long enough to index properly."));
    const first = await claimNextJob();
    expect(first?.documentId).toBe(doc.id);
    expect(await claimNextJob()).toBeNull(); // locked
    await db.update(schema.ingestionJobs).set({ lockedAt: new Date(Date.now() - 11 * 60_000) }).where(eq(schema.ingestionJobs.id, first!.id));
    const again = await claimNextJob();
    expect(again).toMatchObject({ id: first!.id, attempts: 2 });
  });
});

describe("retrieval and chat (stub provider)", () => {
  async function seeded() {
    const t = await team();
    await uploadFile(t.editor, file("handbook.md", "# Vacation\n\nFull-time employees receive 25 vacation days per year.\n\n# Expenses\n\nClient dinners are reimbursable up to 75 dollars per person."));
    await runJobs();
    return t;
  }

  it("retrieves relevant passages with hybrid search and keeps workspaces isolated", async () => {
    const a = await seeded();
    const b = await team();
    await uploadFile(b.editor, file("secret.md", "The vacation house key is under the blue pot near the vacation cabin."));
    await runJobs();
    const r = await retrieve(a.ws.id, "how many vacation days per year");
    expect(r.method).toBe("hybrid");
    expect(r.sources[0]!.content).toContain("25 vacation days");
    expect(r.sources.some((s) => s.content.includes("blue pot"))).toBe(false);
  });

  it("refuses without calling the model when nothing relevant is found", async () => {
    const t = await seeded();
    const res = await ask({ ws: t.ws, userId: t.viewer.user.id, source: "app" }, { question: "zebra quantum spaceship telemetry" });
    const { text, meta } = await drain(res.stream);
    expect(text).toBe("I couldn't find this in the documents.");
    expect(meta.status).toBe("refused");
    const usage = await db.select().from(schema.aiUsage).where(and(eq(schema.aiUsage.scope, t.ws.id), eq(schema.aiUsage.kind, "chat")));
    expect(usage).toHaveLength(0);
    const { messages } = await getConversation({ ws: t.ws, userId: t.viewer.user.id, source: "app" }, res.conversationId);
    expect(messages.map((m) => [m.role, m.status])).toEqual([
      ["user", "ok"],
      ["assistant", "refused"],
    ]);
  });

  it("streams an answer (stub), stores citations and logs usage", async () => {
    const t = await seeded();
    const res = await ask({ ws: t.ws, userId: t.viewer.user.id, source: "app" }, { question: "How many vacation days per year?" });
    expect(res.sources[0]).toMatchObject({ n: 1 });
    const { text, meta } = await drain(res.stream);
    expect(text).toContain("[stub]");
    expect(meta.citations[0]).toMatchObject({ title: "handbook", method: "model" });
    const { messages } = await getConversation({ ws: t.ws, userId: t.viewer.user.id, source: "app" }, res.conversationId);
    expect(messages[1]!.citations).toHaveLength(1);
    expect(await questionsThisMonth(t.ws.id)).toBe(1);
    expect((await listConversations(t.ws.id, t.viewer.user.id))[0]!.id).toBe(res.conversationId);
  });

  it("continues a conversation only for its owner", async () => {
    const t = await seeded();
    const first = await ask({ ws: t.ws, userId: t.viewer.user.id, source: "app" }, { question: "vacation days?" });
    await drain(first.stream);
    await expect(ask({ ws: t.ws, userId: t.editor.user.id, source: "app" }, { question: "and expenses?", conversationId: first.conversationId })).rejects.toMatchObject({ status: 404 });
    await expect(ask({ ws: t.ws, userId: null, source: "widget" }, { question: "and expenses?", conversationId: first.conversationId })).rejects.toMatchObject({ status: 404 });
    const follow = await ask({ ws: t.ws, userId: t.viewer.user.id, source: "app" }, { question: "and expenses?", conversationId: first.conversationId });
    expect(follow.conversationId).toBe(first.conversationId);
  });

  it("enforces the monthly question limit", async () => {
    const t = await seeded();
    await db.update(schema.workspaces).set({ monthlyQuestionLimit: 1 }).where(eq(schema.workspaces.id, t.ws.id));
    const ws = { ...t.ws, monthlyQuestionLimit: 1 };
    await drain((await ask({ ws, userId: t.viewer.user.id, source: "app" }, { question: "vacation days?" })).stream);
    await expect(ask({ ws, userId: t.viewer.user.id, source: "app" }, { question: "again?" })).rejects.toMatchObject({ status: 429, code: "monthly_limit" });
  });

  it("chunk lookup and deletion are workspace-scoped", async () => {
    const a = await seeded();
    const b = await team();
    const [chunk] = await db.select().from(schema.chunks).where(eq(schema.chunks.workspaceId, a.ws.id)).limit(1);
    expect((await getChunk(a.viewer, chunk!.id)).content).toBeTruthy();
    await expect(getChunk(b.owner, chunk!.id)).rejects.toMatchObject({ status: 404 });
    await expect(deleteDocument(b.owner, chunk!.documentId)).rejects.toMatchObject({ status: 404 });
    await deleteDocument(a.editor, chunk!.documentId);
    expect(await db.select().from(schema.chunks).where(eq(schema.chunks.documentId, chunk!.documentId))).toHaveLength(0);
  });
});
