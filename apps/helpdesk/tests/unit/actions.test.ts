import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { tenant } from "./factories";

// Only Next.js runtime pieces are mocked (session cookie lookup, cache revalidation, redirect,
// after()). Authorization, validation and database writes run for real.
const state = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string }, after: [] as (() => unknown)[] }));
vi.mock("@/server/session", () => ({
  getSession: async () => (state.user ? { user: state.user } : null),
  requireUser: async () => {
    if (!state.user) throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" });
    return state.user;
  },
  requireUserApi: async () => {
    if (!state.user) throw Object.assign(new Error("unauthorized"), { status: 401 });
    return state.user;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void state.after.push(fn) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));

const { createTicketAction, replyAction, updateTicketAction, retriageAction } = await import("@/server/actions/tickets");
const { saveArticleAction, deleteArticleAction, reembedAction } = await import("@/server/actions/kb");
const { inviteAction, changeRoleAction, updateSettingsAction, createOrgAction } = await import("@/server/actions/orgs");
const { checkoutAction } = await import("@/server/actions/billing");
const { listAudit, listEmails, usageSummary } = await import("@/server/usage");

const idle = { status: "idle" as const };
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const redirectOf = async (p: Promise<unknown>) => {
  const err = (await p.catch((e: unknown) => e)) as { digest?: string };
  return err?.digest?.split(";")[2];
};

beforeEach(() => {
  state.after = [];
});

describe("server actions (authorization + validation)", () => {
  it("customer creates a ticket, gets redirected, triage is scheduled after the response", async () => {
    const t = await tenant();
    state.user = t.customer.user;
    const url = await redirectOf(createTicketAction(t.org.slug, idle, fd({ subject: "Need a refund", body: "Please refund my order" })));
    expect(url).toBe(`/o/${t.org.slug}/tickets/1?created=1`);
    expect(state.after).toHaveLength(1);
    await state.after[0]!(); // runs triage (AI unavailable in this file) + email delivery
    const [ticket] = await db.select().from(schema.tickets).where(eq(schema.tickets.orgId, t.org.id));
    expect(ticket!.triageStatus).toBe("unavailable");
  });

  it("returns field errors for invalid input instead of throwing", async () => {
    const t = await tenant();
    state.user = t.customer.user;
    const res = await createTicketAction(t.org.slug, idle, fd({ subject: "Hi", body: "short" }));
    expect(res.status).toBe("error");
    expect(Object.keys(res.fieldErrors ?? {}).sort()).toEqual(["body", "subject"]);
  });

  it("blocks customers from agent-only actions", async () => {
    const t = await tenant();
    state.user = t.customer.user;
    await redirectOf(createTicketAction(t.org.slug, idle, fd({ subject: "My ticket", body: "something happened" })));
    expect(await updateTicketAction(t.org.slug, 1, idle, fd({ status: "closed" }))).toMatchObject({ status: "error", message: expect.stringMatching(/permission/) });
    expect(await retriageAction(t.org.slug, 1)).toMatchObject({ status: "error" });
    expect(await saveArticleAction(t.org.slug, null, idle, fd({ title: "Hack", body: "content here" }))).toMatchObject({ status: "error" });
    expect(await inviteAction(t.org.slug, idle, fd({ email: "x@y.demo", role: "admin" }))).toMatchObject({ status: "error" });
    expect(await checkoutAction(t.org.slug)).toMatchObject({ status: "error" });
  });

  it("non-members get a 404 (org existence is not revealed)", async () => {
    const t = await tenant();
    const outsider = await tenant();
    state.user = outsider.admin.user;
    const err = (await updateTicketAction(t.org.slug, 1, idle, fd({ status: "closed" })).catch((e: unknown) => e)) as { digest?: string };
    expect(err.digest).toContain("404");
  });

  it("agent replies, adds notes and updates tickets", async () => {
    const t = await tenant();
    state.user = t.customer.user;
    await redirectOf(createTicketAction(t.org.slug, idle, fd({ subject: "Login broken", body: "cannot sign in at all" })));
    state.user = t.agent.user;
    expect(await replyAction(t.org.slug, 1, idle, fd({ body: "Looking into it", aiAssisted: "true" }))).toMatchObject({ status: "success", message: "Reply sent" });
    expect(await replyAction(t.org.slug, 1, idle, fd({ body: "Check auth logs", internal: "on" }))).toMatchObject({ message: "Internal note added" });
    expect(await updateTicketAction(t.org.slug, 1, idle, fd({ status: "resolved", priority: "high", assigneeId: "none" }))).toMatchObject({ status: "success" });
    const [ticket] = await db.select().from(schema.tickets).where(eq(schema.tickets.orgId, t.org.id));
    expect(ticket).toMatchObject({ status: "resolved", priority: "high", assigneeId: null });
    expect(await retriageAction(t.org.slug, 1)).toMatchObject({ status: "success" }); // AI unavailable -> recorded, not faked
  });

  it("KB article lifecycle with audit trail", async () => {
    const t = await tenant();
    state.user = t.agent.user;
    const url = await redirectOf(saveArticleAction(t.org.slug, null, idle, fd({ title: "Returns", body: "Return within 30 days.", published: "on" })));
    const id = url!.split("/kb/")[1]!.split("?")[0]!;
    await redirectOf(saveArticleAction(t.org.slug, id, idle, fd({ title: "Returns (updated)", body: "Return within 45 days." })));
    const [a] = await db.select().from(schema.kbArticles).where(eq(schema.kbArticles.id, id));
    expect(a).toMatchObject({ title: "Returns (updated)", published: false });
    expect(await reembedAction(t.org.slug)).toMatchObject({ status: "success", message: expect.stringMatching(/unavailable/) });
    expect(await redirectOf(deleteArticleAction(t.org.slug, id))).toBe(`/o/${t.org.slug}/kb?deleted=1`);
    const actions = (await listAudit(t.admin, 1)).items.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["kb.created", "kb.updated", "kb.deleted"]));
  });

  it("admin invites, changes roles and updates settings; emails are logged", async () => {
    const t = await tenant();
    state.user = t.admin.user;
    const inv = await inviteAction(t.org.slug, idle, fd({ email: "New.Agent@Example.demo", role: "agent" }));
    expect(inv).toMatchObject({ status: "success", data: { link: expect.stringContaining("/invite/") } });
    const emails = await listEmails(t.admin);
    expect(emails[0]).toMatchObject({ to: "new.agent@example.demo", status: "logged" });
    expect(await changeRoleAction(t.org.slug, idle, fd({ membershipId: "not-a-uuid", role: "admin" }))).toMatchObject({ status: "error" });
    expect(await updateSettingsAction(t.org.slug, idle, fd({ name: "Renamed Org" }))).toMatchObject({ status: "success" });
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, t.org.id));
    expect(org).toMatchObject({ name: "Renamed Org", allowCustomerSignup: false });
  });

  it("billing checkout fails safely without a reachable Stripe account", async () => {
    const t = await tenant();
    state.user = t.admin.user;
    vi.spyOn(console, "error").mockImplementation(() => {});
    // The unit-test key is a dummy test-mode key; Stripe rejects it, and the action reports a safe error.
    const res = await checkoutAction(t.org.slug);
    expect(res.status).toBe("error");
    expect(res.message).not.toMatch(/sk_test/);
  });

  it("signed-out users are sent to sign-in; new users can create an org", async () => {
    state.user = null;
    expect(await redirectOf(createOrgAction(idle, fd({ name: "Nope", slug: "nope-org" })))).toBe("/sign-in");
    const t = await tenant();
    state.user = t.customer.user;
    expect(await redirectOf(createOrgAction(idle, fd({ name: "Fresh Org", slug: "fresh-org-1" })))).toBe("/o/fresh-org-1/tickets");
  });

  it("usage summary aggregates AI calls by feature", async () => {
    const t = await tenant();
    await db.insert(schema.aiUsage).values([
      { scope: t.org.id, feature: "triage", kind: "chat", provider: "local", model: "m", latencyMs: 1000, ok: 1, outputTokens: 20 },
      { scope: t.org.id, feature: "triage", kind: "chat", provider: "local", model: "m", latencyMs: 3000, ok: 0, errorCode: "timeout" },
      { scope: t.org.id, feature: "draft_reply", kind: "chat", provider: "local", model: "m", latencyMs: 500, ok: 1, outputTokens: 100 },
    ]);
    const u = await usageSummary(t.agent);
    expect(u.today).toBe(3);
    expect(u.limit).toBe(100);
    expect(u.byFeature.find((f) => f.feature === "triage")).toMatchObject({ calls: 2, failures: 1, avgLatencyMs: 2000, outputTokens: 20 });
  });
});
