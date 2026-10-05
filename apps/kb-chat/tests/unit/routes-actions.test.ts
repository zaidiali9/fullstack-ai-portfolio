import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { embedAllowed } from "@/server/workspaces";
import { file, makeUser, team } from "./factories";

// Only Next.js runtime pieces are mocked (session lookup, cache revalidation, redirect, after()).
// Authorization, validation, rate limiting and database writes run for real. AI = labeled stub.
const state = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string }, after: [] as (() => unknown)[] }));
vi.mock("@/server/session", () => ({
  getSession: async () => (state.user ? { user: state.user } : null),
  requireUser: async () => {
    if (!state.user) throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" });
    return state.user;
  },
  requireUserApi: async () => {
    if (!state.user) {
      const { unauthorized } = await import("@portfolio/kit");
      throw unauthorized();
    }
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

const documentsRoute = await import("@/app/api/w/[ws]/documents/route");
const chatRoute = await import("@/app/api/w/[ws]/chat/route");
const embedRoute = await import("@/app/api/embed/[key]/chat/route");
const cronRoute = await import("@/app/api/cron/ingest/route");
const actions = await import("@/server/actions/workspace");
const { runJobs } = await import("@/server/ingest/pipeline");

const ORIGIN = "http://localhost:3002";
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) }) as never;
const idle = { status: "idle" as const };
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const uploadReq = (files: File[], origin = ORIGIN) => {
  const form = new FormData();
  files.forEach((f) => form.append("file", f));
  return new Request(`${ORIGIN}/api/w/x/documents`, { method: "POST", body: form, headers: { origin, host: "localhost:3002" } });
};
const jsonReq = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: ORIGIN, host: "localhost:3002", ...headers } });

beforeEach(() => {
  state.after = [];
});

describe("document upload route", () => {
  it("lets editors upload (202) and queues background ingestion", async () => {
    const t = await team();
    state.user = t.editor.user;
    const res = await documentsRoute.POST(uploadReq([file("policy.md", "# Policy\n\nThe refund window is 30 days for all orders.")]), ctx({ ws: t.ws.slug }));
    expect(res.status).toBe(202);
    expect((await res.json()).results[0]).toMatchObject({ ok: true });
    expect(state.after).toHaveLength(1);
  });
  it("rejects viewers (403), non-members (404), signed-out users (401) and cross-site posts (403)", async () => {
    const t = await team();
    state.user = t.viewer.user;
    expect((await documentsRoute.POST(uploadReq([file("a.md", "content content")]), ctx({ ws: t.ws.slug }))).status).toBe(403);
    state.user = await makeUser();
    expect((await documentsRoute.POST(uploadReq([file("a.md", "content content")]), ctx({ ws: t.ws.slug }))).status).toBe(404);
    state.user = null;
    expect((await documentsRoute.POST(uploadReq([file("a.md", "content content")]), ctx({ ws: t.ws.slug }))).status).toBe(401);
    state.user = t.editor.user;
    expect((await documentsRoute.POST(uploadReq([file("a.md", "content content")], "https://evil.example"), ctx({ ws: t.ws.slug }))).status).toBe(403);
  });
  it("reports per-file validation errors", async () => {
    const t = await team();
    state.user = t.editor.user;
    const res = await documentsRoute.POST(uploadReq([file("evil.pdf", "MZ not a pdf"), file("ok.txt", "A perfectly fine text file.")]), ctx({ ws: t.ws.slug }));
    const body = (await res.json()) as { results: { ok: boolean; error?: string }[] };
    expect(body.results.map((r) => r.ok)).toEqual([false, true]);
    expect(body.results[0]!.error).toMatch(/valid PDF/);
  });
});

describe("chat routes (stub AI)", () => {
  it("streams an answer with conversation id and sources headers for members", async () => {
    const t = await team();
    state.user = t.editor.user;
    await documentsRoute.POST(uploadReq([file("hb.md", "# Vacation\n\nEmployees receive 25 vacation days per year.")]), ctx({ ws: t.ws.slug }));
    await runJobs();
    state.user = t.viewer.user;
    const res = await chatRoute.POST(jsonReq(`${ORIGIN}/api/w/${t.ws.slug}/chat`, { question: "How many vacation days?" }), ctx({ ws: t.ws.slug }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-conversation-id")).toMatch(/[0-9a-f-]{36}/);
    expect(await res.text()).toContain("[stub]");
  });
  it("validates input and blocks outsiders", async () => {
    const t = await team();
    state.user = t.viewer.user;
    expect((await chatRoute.POST(jsonReq(`${ORIGIN}/x`, { question: "" }), ctx({ ws: t.ws.slug }))).status).toBe(400);
    expect((await chatRoute.POST(jsonReq(`${ORIGIN}/x`, { question: "x".repeat(1001) }), ctx({ ws: t.ws.slug }))).status).toBe(400);
    state.user = await makeUser();
    expect((await chatRoute.POST(jsonReq(`${ORIGIN}/x`, { question: "hello there" }), ctx({ ws: t.ws.slug }))).status).toBe(404);
  });
});

describe("widget", () => {
  it("only answers for enabled widgets and rate limits each visitor IP", async () => {
    const t = await team();
    state.user = null;
    const req = () => jsonReq(`${ORIGIN}/api/embed/${t.ws.widgetKey}/chat`, { question: "anything at all?" }, { "x-real-ip": "203.0.113.7" });
    expect((await embedRoute.POST(req(), ctx({ key: t.ws.widgetKey }))).status).toBe(404); // disabled by default
    await db.update(schema.workspaces).set({ widgetEnabled: true }).where(eq(schema.workspaces.id, t.ws.id));
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await embedRoute.POST(req(), ctx({ key: t.ws.widgetKey }))).status);
    expect(statuses.slice(0, 6).every((s) => s === 200)).toBe(true); // refusals (no documents) still answer
    expect(statuses[6]).toBe(429); // WIDGET_PER_MINUTE default 6
  });
  it("is served only on allowlisted sites (Referer check)", () => {
    expect(embedAllowed(["https://shop.example"], "https://shop.example/help?x=1", ORIGIN)).toBe(true);
    expect(embedAllowed(["https://shop.example"], "https://evil.example/", ORIGIN)).toBe(false);
    expect(embedAllowed([], `${ORIGIN}/w/a/settings`, ORIGIN)).toBe(true); // in-app preview
    expect(embedAllowed(["https://shop.example"], null, ORIGIN)).toBe(false);
  });
});

describe("cron route", () => {
  it("requires the bearer secret", async () => {
    expect((await cronRoute.GET(new Request(`${ORIGIN}/api/cron/ingest`))).status).toBe(401);
    expect((await cronRoute.GET(new Request(`${ORIGIN}/api/cron/ingest`, { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    const ok = await cronRoute.GET(new Request(`${ORIGIN}/api/cron/ingest`, { headers: { authorization: "Bearer test-cron-secret" } }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ processed: expect.any(Number) });
  });
});

describe("server actions", () => {
  const redirectOf = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as { digest?: string })?.digest?.split(";")[2];

  it("creates a workspace with the caller as owner", async () => {
    state.user = await makeUser();
    expect(await redirectOf(actions.createWorkspaceAction(idle, fd({ name: "New Space", slug: "new-space-1" })))).toBe("/w/new-space-1/documents");
    const res = await actions.createWorkspaceAction(idle, fd({ name: "Dup", slug: "new-space-1" }));
    expect(res).toMatchObject({ status: "error", message: expect.stringMatching(/taken/) });
  });
  it("member management is owner-only and keeps at least one owner", async () => {
    const t = await team();
    const newcomer = await makeUser("Newcomer");
    state.user = t.editor.user;
    expect(await actions.addMemberAction(t.ws.slug, idle, fd({ email: newcomer.email, role: "viewer" }))).toMatchObject({ status: "error" });
    state.user = t.owner.user;
    expect(await actions.addMemberAction(t.ws.slug, idle, fd({ email: newcomer.email, role: "viewer" }))).toMatchObject({ status: "success" });
    expect(await actions.addMemberAction(t.ws.slug, idle, fd({ email: "nobody@nowhere.demo", role: "viewer" }))).toMatchObject({ message: expect.stringMatching(/sign up/) });
    const [ownerRow] = await db.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.userId, t.owner.user.id));
    expect(await actions.changeRoleAction(t.ws.slug, idle, fd({ memberId: ownerRow!.id, role: "viewer" }))).toMatchObject({ message: expect.stringMatching(/at least one owner/) });
    expect(await actions.removeMemberAction(t.ws.slug, ownerRow!.id)).toMatchObject({ message: expect.stringMatching(/at least one owner/) });
  });
  it("validates widget origins and rotates keys", async () => {
    const t = await team();
    state.user = t.owner.user;
    const bad = await actions.updateWidgetAction(t.ws.slug, idle, fd({ widgetEnabled: "on", widgetGreeting: "Hello!", widgetAllowedOrigins: "https://ok.example\nhttps://bad.example/path" }));
    expect(bad.status).toBe("error");
    const good = await actions.updateWidgetAction(t.ws.slug, idle, fd({ widgetEnabled: "on", widgetGreeting: "Hello!", widgetAllowedOrigins: "https://ok.example/, https://help.ok.example" }));
    expect(good.status).toBe("success");
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, t.ws.id));
    expect(ws).toMatchObject({ widgetEnabled: true, widgetAllowedOrigins: ["https://ok.example", "https://help.ok.example"] });
    await actions.rotateWidgetKeyAction(t.ws.slug);
    const [rotated] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, t.ws.id));
    expect(rotated!.widgetKey).not.toBe(ws!.widgetKey);
  });
  it("refuses private URLs and lets only editors delete documents", async () => {
    const t = await team();
    state.user = t.editor.user;
    expect(await actions.addUrlAction(t.ws.slug, idle, fd({ url: "http://169.254.169.254/latest/meta-data" }))).toMatchObject({ status: "error", message: expect.stringMatching(/not allowed/) });
    const doc = await (await import("@/server/documents")).uploadFile(t.editor, file("d.md", "Deletable content for the test."));
    state.user = t.viewer.user;
    expect(await actions.deleteDocumentAction(t.ws.slug, doc.id)).toMatchObject({ status: "error" });
    state.user = t.editor.user;
    expect(await actions.deleteDocumentAction(t.ws.slug, doc.id)).toMatchObject({ status: "success" });
  });
});
