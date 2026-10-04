import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { tenant } from "./factories";

// STUB provider (AI_PROVIDER=stub): exercises the wiring around the model — persistence, usage
// logging and vector retrieval — without claiming anything about model quality.
process.env.AI_PROVIDER = "stub";

let features: typeof import("@/server/ai/features");
let kb: typeof import("@/server/kb");
let tickets: typeof import("@/server/tickets");

beforeAll(async () => {
  features = await import("@/server/ai/features");
  kb = await import("@/server/kb");
  tickets = await import("@/server/tickets");
});

describe("AI wiring with the labeled stub provider", () => {
  it("stub triage is validated, stored, audited and logged to ai_usage", async () => {
    const t = await tenant();
    const { ticket } = await tickets.createTicket(t.customer, { subject: "Invoice charge wrong", body: "My invoice charge is wrong!" });
    await features.runTriage(ticket.id);
    const [fresh] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, ticket.id));
    expect(fresh).toMatchObject({ triageStatus: "done", category: "billing", sentiment: "negative" });
    expect(fresh!.aiSummary).toContain("[stub]");
    const usage = await db.select().from(schema.aiUsage).where(eq(schema.aiUsage.scope, t.org.id));
    expect(usage).toMatchObject([{ feature: "triage", provider: "stub", ok: 1 }]);
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, "ticket.triaged"));
    expect(audit.length).toBeGreaterThan(0);
  });

  it("embeds articles and retrieves by vector similarity (stub embeddings)", async () => {
    const t = await tenant();
    await db.insert(schema.kbArticles).values([
      { orgId: t.org.id, title: "Password reset", body: "reset password email link forgot password" },
      { orgId: t.org.id, title: "Shipping", body: "shipping carrier tracking delivery days" },
    ]);
    expect(await kb.embedPendingArticles(t.org.id)).toBe(2);
    const hits = await kb.retrieveArticles(t.org.id, "forgot password reset email");
    expect(hits[0]).toMatchObject({ title: "Password reset", method: "vector" });
  });

  it("draftReply streams text and reports the sources given to the model", async () => {
    const t = await tenant();
    await db.insert(schema.kbArticles).values({ orgId: t.org.id, title: "Refunds", body: "refund charge duplicate" });
    await kb.embedPendingArticles(t.org.id);
    const { ticket } = await tickets.createTicket(t.customer, { subject: "Duplicate charge", body: "refund my duplicate charge" });
    const { stream, sources } = await features.draftReply(t.agent, ticket.number);
    let text = "";
    for await (const part of stream) text += part;
    expect(text).toContain("[stub]");
    expect(sources[0]).toMatchObject({ ref: "KB-1", title: "Refunds" });
  });
});
