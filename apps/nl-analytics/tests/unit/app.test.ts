import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { readTextStream, streamResponse } from "@portfolio/ai";
import { HttpError } from "@portfolio/kit";
import { db, schema } from "@/db";
import type { AppUser } from "@/server/access";
import { seedDataset } from "@db/seed-data";

// Only Next.js runtime pieces are mocked (session lookup, revalidation, redirect); everything else is real.
const state = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string; role: string } }));
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
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));

const { askQuestion, runManual, streamSummary } = await import("@/server/ai/features");
const q = await import("@/server/queries");
const actions = await import("@/server/actions/queries");

async function makeUser(role: "admin" | "analyst" = "analyst", name = "Test User"): Promise<AppUser> {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name, email: `${id.slice(0, 8)}@test.demo`, emailVerified: true, role });
  return { id, name, email: `${id.slice(0, 8)}@test.demo`, role };
}

async function expectHttp(p: Promise<unknown>, status: number) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpError);
  expect((err as HttpError).status).toBe(status);
  return err as HttpError;
}

let alice: AppUser;
let bob: AppUser;
beforeAll(async () => {
  await seedDataset(db, { today: new Date("2026-10-05T12:00:00Z"), customers: 300 });
  alice = await makeUser("analyst", "Alice");
  bob = await makeUser("analyst", "Bob");
});

describe("asking questions (stub AI)", () => {
  it("returns SQL, a guarded result and a fitting chart (stub AI)", async () => {
    const r = await askQuestion(alice, { question: "monthly revenue please" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sql).toContain("FROM demo.orders");
    expect(r.chart).toEqual({ type: "line", x: "month", y: ["revenue"] });
    expect(r.result.columns.map((c) => c.name)).toEqual(["month", "revenue"]);
    expect(r.attempts).toBe(1);
    expect(r.model.provider).toBe("stub");
    const [run] = await db.select().from(schema.queryRuns).where(eq(schema.queryRuns.userId, alice.id)).orderBy(desc(schema.queryRuns.createdAt)).limit(1);
    expect(run).toMatchObject({ status: "ok", source: "ai", question: "monthly revenue please" });
  });

  it("never executes unsafe model SQL: guard rejects, repair turns run, the user gets the SQL and reason (stub AI)", async () => {
    const before = await db.$count(schema.orders);
    const r = await askQuestion(alice, { question: "drop the orders table" });
    expect(r).toMatchObject({ ok: false, code: "sql_rejected", attempts: 3, sql: "DROP TABLE demo.orders" });
    expect(await db.$count(schema.orders)).toBe(before);
    const rejected = await db.select().from(schema.queryRuns).where(eq(schema.queryRuns.status, "rejected"));
    expect(rejected.filter((x) => x.question === "drop the orders table")).toHaveLength(3);
  });

  it("reports questions the data can't answer (stub AI)", async () => {
    const r = await askQuestion(alice, { question: "what was the weather like?" });
    expect(r).toMatchObject({ ok: false, code: "unanswerable", explanation: "" });
    expect(!r.ok && r.error).toBe("No query was run: the AI didn't write SQL for this question. Its note: “[stub] The dataset has no weather data.”");
  });

  it("validates input and rate limits per user (stub AI)", async () => {
    await expect(askQuestion(alice, { question: "x" })).rejects.toThrow();
    const carol = await makeUser();
    const results = await Promise.allSettled(Array.from({ length: 11 }, () => askQuestion(carol, { question: "revenue by region" })));
    expect(results.some((r) => r.status === "rejected" && r.reason instanceof HttpError && r.reason.status === 429)).toBe(true);
  });

  it("streams a summary with a number-check trailer (stub AI)", async () => {
    const stream = await streamSummary(alice, { question: "orders", sql: "SELECT count(*) AS orders FROM demo.orders" });
    const res = await streamResponse(stream, { onEarlyError: () => new Response("x", { status: 500 }), trailer: (m) => m });
    let meta: unknown;
    const text = await readTextStream(res, () => {}, (m) => (meta = m));
    expect(text).toContain("[stub]");
    expect(meta).toEqual({ unverified: [], provider: "stub", model: "stub-model" });
  });
});

describe("hand-written SQL", () => {
  it("runs through the same guard and picks a chart", async () => {
    const r = await runManual(alice, { sql: "SELECT status, count(*) AS orders FROM demo.orders GROUP BY status" });
    expect(r.chart).toEqual({ type: "bar", x: "status", y: ["orders"] });
    await expectHttp(runManual(alice, { sql: "UPDATE demo.orders SET total = 0" }), 422);
  });
});

describe("saved queries and dashboards", () => {
  const monthly = { title: "Monthly orders", question: "orders per month", sql: "SELECT date_trunc('month', order_date)::date AS month, count(*) AS orders FROM demo.orders GROUP BY 1 ORDER BY 1", chart: { type: "line", x: "month", y: ["orders"] } };

  it("saves only guarded SQL and keeps queries private to their owner", async () => {
    await expectHttp(q.saveQuery(alice, { ...monthly, sql: "DELETE FROM demo.orders" }), 422);
    const saved = await q.saveQuery(alice, monthly);
    expect(saved.source).toBe("ai");
    await expectHttp(q.getQuery(bob, saved.id), 404);
    await expectHttp(q.runSaved(bob, saved.id), 404);
    await expectHttp(q.getQuery(alice, "not-a-uuid"), 404);
    const { result } = await q.runSaved(alice, saved.id);
    expect(result.rowCount).toBeGreaterThan(0);
    const updated = await q.updateQuery(alice, saved.id, { ...monthly, title: "Orders per month" });
    expect(updated.title).toBe("Orders per month");
    expect((await q.listQueries(alice)).map((x) => x.id)).toContain(saved.id);
    expect(await q.listQueries(bob)).toEqual([]);
  });

  it("builds a dashboard, orders tiles, and shares/revokes a read-only link", async () => {
    const a = await q.saveQuery(alice, monthly);
    const b = await q.saveQuery(alice, { title: "Orders by status", sql: "SELECT status, count(*) AS n FROM demo.orders GROUP BY 1", chart: { type: "bar", x: "status", y: ["n"] } });
    const bobs = await q.saveQuery(bob, monthly);
    const d = await q.createDashboard(alice, { title: "Ops" });
    await q.addTile(alice, { dashboardId: d.id, queryId: a.id });
    await q.addTile(alice, { dashboardId: d.id, queryId: b.id, width: 2 });
    await expectHttp(q.addTile(alice, { dashboardId: d.id, queryId: bobs.id }), 404);
    await expectHttp(q.addTile(bob, { dashboardId: d.id, queryId: bobs.id }), 404);
    await q.moveTile(alice, d.id, b.id, -1);
    expect((await q.getDashboard(alice, d.id)).tiles.map((t) => t.queryId)).toEqual([b.id, a.id]);
    await q.setTileWidth(alice, d.id, a.id, 2);

    const token = (await q.setSharing(alice, d.id, true))!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const shared = await q.getSharedDashboard(token);
    expect(shared.tiles).toHaveLength(2);
    const tiles = await q.runTiles(shared.tiles, { userId: null, source: "shared" });
    expect(tiles.every((t) => t.result && !t.error)).toBe(true);
    await expectHttp(q.getSharedDashboard("short"), 404);
    await q.setSharing(alice, d.id, false);
    await expectHttp(q.getSharedDashboard(token), 404);

    const list = await q.listDashboards(alice);
    expect(list.find((x) => x.id === d.id)).toMatchObject({ tiles: 2, shared: false });
    await q.removeTile(alice, d.id, a.id);
    await q.deleteDashboard(alice, d.id);
    await expectHttp(q.getDashboard(alice, d.id), 404);
  });

  it("shows a readable error for a tile whose SQL no longer runs", async () => {
    const [bad] = await db.insert(schema.savedQueries).values({ ownerId: alice.id, title: "Broken", sql: "SELECT nope FROM demo.orders", chart: { type: "table", x: null, y: [] } }).returning();
    const [tile] = await q.runTiles([{ queryId: bad!.id, position: 0, width: 1, title: "Broken", sql: bad!.sql, chart: bad!.chart, question: "" }], { userId: alice.id, source: "dashboard" });
    expect(tile!.result).toBeNull();
    expect(tile!.error).toContain('column "nope" does not exist');
  });

  it("admin stats count every attempt", async () => {
    const stats = await q.runStats();
    expect(stats.runs.total).toBeGreaterThan(0);
    expect(stats.runs.rejected).toBeGreaterThan(0);
    expect(stats.ai.some((a) => a.feature === "nl_sql")).toBe(true);
    expect((await q.listRuns(5)).length).toBe(5);
  });
});

describe("server actions", () => {
  it("require sign-in, validate, and return safe messages", async () => {
    state.user = null;
    await expect(actions.saveQueryAction({})).rejects.toMatchObject({ digest: expect.stringContaining("/sign-in") });
    state.user = alice;
    expect(await actions.saveQueryAction({ title: "", sql: "x", chart: { type: "table" } })).toMatchObject({ ok: false, message: "Some fields are invalid." });
    const ok = await actions.saveQueryAction({ title: "Count", sql: "SELECT count(*) AS n FROM demo.orders", chart: { type: "number", x: null, y: ["n"] } });
    expect(ok.ok).toBe(true);
    const id = (ok as { data: { id: string } }).data.id;
    state.user = bob;
    expect(await actions.updateQueryAction(id, { title: "Mine now", sql: "SELECT 1 FROM demo.orders", chart: { type: "table" } })).toMatchObject({ ok: false, message: "Query not found." });
    expect(await actions.deleteQueryAction(id)).toMatchObject({ status: "error" });
    state.user = alice;
    await expect(actions.deleteQueryAction(id)).rejects.toMatchObject({ digest: expect.stringContaining("/queries?deleted=1") });
    const fd = new FormData();
    fd.set("title", "Board");
    await expect(actions.createDashboardAction({ status: "idle" }, fd)).rejects.toMatchObject({ digest: expect.stringContaining("/dashboards/") });
  });
});
