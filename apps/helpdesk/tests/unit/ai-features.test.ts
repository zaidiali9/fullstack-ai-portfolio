import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { runTriage } from "@/server/ai/features";
import { aiCallsToday, enforceOrgQuota } from "@/server/ai/quota";
import { retrieveArticles } from "@/server/kb";
import { createTicket } from "@/server/tickets";
import { tenant } from "./factories";

// This file runs with AI_PROVIDER=none (vitest.config env): it checks the graceful fallbacks.

describe("AI unavailable fallbacks", () => {
  it("marks triage 'unavailable' instead of inventing values", async () => {
    const t = await tenant();
    const { ticket } = await createTicket(t.customer, { subject: "Refund please", body: "I want a refund for my order" });
    await runTriage(ticket.id);
    const [fresh] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, ticket.id));
    expect(fresh).toMatchObject({ triageStatus: "unavailable", category: null, aiSummary: null, priority: "medium" });
  });

  it("retrieves KB articles with full-text search when embeddings are unavailable", async () => {
    const t = await tenant();
    await db.insert(schema.kbArticles).values([
      { orgId: t.org.id, title: "Refund policy", body: "Duplicate charges are refunded within 3 business days." },
      { orgId: t.org.id, title: "Shipping times", body: "Standard shipping takes 3-5 business days." },
      { orgId: t.org.id, title: "Unpublished refund draft", body: "refund refund refund", published: false },
    ]);
    const hits = await retrieveArticles(t.org.id, "I was charged twice, please refund the duplicate charge");
    expect(hits[0]).toMatchObject({ title: "Refund policy", method: "fulltext" });
    expect(hits.map((h) => h.title)).not.toContain("Unpublished refund draft");
    const other = await tenant();
    expect(await retrieveArticles(other.org.id, "refund")).toEqual([]); // tenant-scoped
  });
});

describe("plan quotas", () => {
  it("blocks AI once the daily plan limit is reached", async () => {
    const t = await tenant();
    await db.insert(schema.aiUsage).values(
      Array.from({ length: 100 }, () => ({ scope: t.org.id, feature: "triage", kind: "chat", provider: "stub", model: "m", latencyMs: 1, ok: 1 })),
    );
    expect(await aiCallsToday(t.org.id)).toBe(100);
    await expect(enforceOrgQuota(t.org)).rejects.toMatchObject({ status: 429, code: "ai_quota_exceeded" });
    const pro = await tenant("pro");
    await expect(enforceOrgQuota(pro.org)).resolves.toBeUndefined();
  });
});
