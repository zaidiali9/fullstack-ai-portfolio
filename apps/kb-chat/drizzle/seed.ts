/**
 * Seed script: demo users, a workspace for the fictional "Brightline Studio" with five documents
 * (Markdown, text, a generated 3-page PDF and a generated DOCX), ingested through the REAL pipeline.
 * With an embeddings provider configured (e.g. AI_LOCAL_MODELS=true) passages get vectors;
 * otherwise they are keyword-searchable only. No AI answers are seeded.
 */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { inArray } from "drizzle-orm";
import { db, dbHandle, schema } from "@/db";
import { aiStatus } from "@/lib/ai";
import { DEMO_PASSWORD } from "@/lib/demo";
import { runJobs } from "@/server/ingest/pipeline";
import { newWidgetKey } from "@/server/workspaces";
import { buildDocx, buildPdf } from "./seed-files";

const USERS = [
  { key: "owner", name: "Jordan Lee", email: "owner@cairn.demo" },
  { key: "editor", name: "Lena Park", email: "editor@cairn.demo" },
  { key: "viewer", name: "Tom Becker", email: "viewer@cairn.demo" },
];
const SLUGS = ["brightline", "side-project"];
const dir = path.join(import.meta.dirname, "seed-docs");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");

async function main() {
  const t0 = Date.now();
  await db.delete(schema.workspaces).where(inArray(schema.workspaces.slug, SLUGS));
  await db.delete(schema.user).where(inArray(schema.user.email, USERS.map((u) => u.email)));

  const hash = await hashPassword(DEMO_PASSWORD);
  const ids = new Map<string, string>();
  for (const u of USERS) {
    const id = randomUUID();
    ids.set(u.key, id);
    await db.insert(schema.user).values({ id, name: u.name, email: u.email, emailVerified: true });
    await db.insert(schema.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
  }

  const [ws] = await db
    .insert(schema.workspaces)
    .values({ name: "Brightline Handbook", slug: "brightline", widgetKey: newWidgetKey(), widgetEnabled: true, widgetGreeting: "Hi! Ask me about Brightline's policies.", widgetAllowedOrigins: [] })
    .returning();
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: ws!.id, userId: ids.get("owner")!, role: "owner" },
    { workspaceId: ws!.id, userId: ids.get("editor")!, role: "editor" },
    { workspaceId: ws!.id, userId: ids.get("viewer")!, role: "viewer" },
  ]);
  // A second workspace proves isolation: its document must never appear in Brightline answers.
  const [other] = await db.insert(schema.workspaces).values({ name: "Side Project Notes", slug: "side-project", widgetKey: newWidgetKey() }).returning();
  await db.insert(schema.workspaceMembers).values({ workspaceId: other!.id, userId: ids.get("owner")!, role: "owner" });

  const files: { ws: string; title: string; fileName: string; mimeType: string; data: Buffer }[] = [
    { ws: ws!.id, title: "Employee Handbook", fileName: "employee-handbook.md", mimeType: "text/markdown", data: Buffer.from(read("employee-handbook.md")) },
    { ws: ws!.id, title: "Travel and Expense Policy", fileName: "travel-expense-policy.pdf", mimeType: "application/pdf", data: await buildPdf(read("travel-expense-policy.txt")) },
    {
      ws: ws!.id,
      title: "Security Incident Response Guide",
      fileName: "security-incident-response.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      data: await buildDocx(read("security-incident-response.txt")),
    },
    { ws: ws!.id, title: "IT Help FAQ", fileName: "it-faq.md", mimeType: "text/markdown", data: Buffer.from(read("it-faq.md")) },
    { ws: ws!.id, title: "New Hire Onboarding Checklist", fileName: "onboarding-checklist.txt", mimeType: "text/plain", data: Buffer.from(read("onboarding-checklist.txt")) },
    {
      ws: other!.id,
      title: "Garden plan",
      fileName: "garden-plan.md",
      mimeType: "text/markdown",
      data: Buffer.from("# Garden plan\n\nSEED DATA. The tomatoes get 25 days of extra watering in July. The vacation house key is under the blue pot."),
    },
  ];
  for (const f of files) {
    const [doc] = await db
      .insert(schema.documents)
      .values({
        workspaceId: f.ws,
        title: f.title,
        sourceType: "file",
        fileName: f.fileName,
        mimeType: f.mimeType,
        sizeBytes: f.data.length,
        contentHash: createHash("sha256").update(f.data).digest("hex"),
        createdById: ids.get("owner")!,
      })
      .returning();
    await db.insert(schema.documentBlobs).values({ documentId: doc!.id, data: f.data });
    await db.insert(schema.ingestionJobs).values({ documentId: doc!.id, workspaceId: f.ws });
  }
  const embeddings = aiStatus().embeddings;
  const result = await runJobs({ timeBudgetMs: 600_000 });
  const chunks = await db.select({ id: schema.chunks.id }).from(schema.chunks);
  console.log(
    `Seeded ${USERS.length} users, 2 workspaces, ${files.length} documents -> ${result.processed} indexed (${result.failed} failed), ` +
      `${chunks.length} passages, embeddings: ${embeddings ? `${embeddings.provider}/${embeddings.model}` : "unavailable (keyword search only)"} in ${Date.now() - t0}ms`,
  );
  console.log("Demo logins (password in README):", USERS.map((u) => u.email).join(", "));
}

main()
  .then(() => dbHandle().close())
  .catch(async (err) => {
    console.error(err);
    await dbHandle().close();
    process.exit(1);
  });
