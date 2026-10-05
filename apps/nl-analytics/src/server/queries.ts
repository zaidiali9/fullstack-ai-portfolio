import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";
import { HttpError, notFound } from "@portfolio/kit";
import { db, schema } from "@/db";
import type { ChartSpec } from "@db/schema";
import type { AppUser } from "./access";
import { CHART_TYPES } from "./ai/nl-sql-core";
import { guardSql } from "./sql/guard";
import { runReadOnly, type QueryResult, type RunSource } from "./sql/execute";

/* ------------------------------------------------------------------ saved queries */

const chartInput = z.object({
  type: z.enum(CHART_TYPES),
  x: z.string().max(63).nullable().default(null),
  y: z.array(z.string().max(63)).max(4).default([]),
});

export const saveQueryInput = z.object({
  title: z.string().trim().min(1, "Give the query a title.").max(100),
  question: z.string().trim().max(500).default(""),
  sql: z.string().min(1).max(4000),
  chart: chartInput,
  source: z.enum(["ai", "manual"]).default("ai"),
});

/** Only SQL that passes the guard can be saved (it is re-checked on every run anyway). */
async function assertSafe(text: string) {
  const g = await guardSql(text);
  if (!g.ok) throw new HttpError(422, "sql_rejected", g.reason);
  return g.sql;
}

export async function saveQuery(user: AppUser, raw: unknown) {
  const input = saveQueryInput.parse(raw);
  const clean = await assertSafe(input.sql);
  const [row] = await db
    .insert(schema.savedQueries)
    .values({ ownerId: user.id, title: input.title, question: input.question, sql: clean, chart: input.chart as ChartSpec, source: input.source })
    .returning();
  return row!;
}

export async function updateQuery(user: AppUser, id: string, raw: unknown) {
  const input = saveQueryInput.partial({ question: true, source: true }).parse(raw);
  await getQuery(user, id);
  const clean = await assertSafe(input.sql);
  const [row] = await db
    .update(schema.savedQueries)
    .set({ title: input.title, sql: clean, chart: input.chart as ChartSpec, ...(input.question !== undefined ? { question: input.question } : {}), updatedAt: new Date() })
    .where(and(eq(schema.savedQueries.id, id), eq(schema.savedQueries.ownerId, user.id)))
    .returning();
  return row!;
}

export async function getQuery(user: AppUser, id: string) {
  if (!z.uuid().safeParse(id).success) throw notFound("Query");
  const [row] = await db
    .select()
    .from(schema.savedQueries)
    .where(and(eq(schema.savedQueries.id, id), eq(schema.savedQueries.ownerId, user.id)))
    .limit(1);
  if (!row) throw notFound("Query");
  return row;
}

export async function listQueries(user: AppUser) {
  return db.select().from(schema.savedQueries).where(eq(schema.savedQueries.ownerId, user.id)).orderBy(desc(schema.savedQueries.updatedAt));
}

export async function deleteQuery(user: AppUser, id: string) {
  await getQuery(user, id);
  await db.delete(schema.savedQueries).where(and(eq(schema.savedQueries.id, id), eq(schema.savedQueries.ownerId, user.id)));
}

export async function runSaved(user: AppUser, id: string, source: RunSource = "saved") {
  const q = await getQuery(user, id);
  return { query: q, result: await runReadOnly(q.sql, { userId: user.id, source, question: q.question }) };
}

/* ------------------------------------------------------------------ dashboards */

export const dashboardInput = z.object({
  title: z.string().trim().min(1, "Give the dashboard a title.").max(100),
  description: z.string().trim().max(300).default(""),
});

export async function createDashboard(user: AppUser, raw: unknown) {
  const input = dashboardInput.parse(raw);
  const [row] = await db.insert(schema.dashboards).values({ ownerId: user.id, ...input }).returning();
  return row!;
}

export async function updateDashboard(user: AppUser, id: string, raw: unknown) {
  const input = dashboardInput.parse(raw);
  await getDashboard(user, id);
  await db.update(schema.dashboards).set({ ...input, updatedAt: new Date() }).where(eq(schema.dashboards.id, id));
}

export async function listDashboards(user: AppUser) {
  return db
    .select({
      id: schema.dashboards.id,
      title: schema.dashboards.title,
      description: schema.dashboards.description,
      shared: sql<boolean>`${schema.dashboards.shareToken} is not null`,
      updatedAt: schema.dashboards.updatedAt,
      tiles: sql<number>`(select count(*)::int from dashboard_tiles t where t.dashboard_id = ${schema.dashboards.id})`,
    })
    .from(schema.dashboards)
    .where(eq(schema.dashboards.ownerId, user.id))
    .orderBy(desc(schema.dashboards.updatedAt));
}

async function tilesOf(dashboardId: string) {
  return db
    .select({ queryId: schema.dashboardTiles.queryId, position: schema.dashboardTiles.position, width: schema.dashboardTiles.width, title: schema.savedQueries.title, sql: schema.savedQueries.sql, chart: schema.savedQueries.chart, question: schema.savedQueries.question })
    .from(schema.dashboardTiles)
    .innerJoin(schema.savedQueries, eq(schema.savedQueries.id, schema.dashboardTiles.queryId))
    .where(eq(schema.dashboardTiles.dashboardId, dashboardId))
    .orderBy(asc(schema.dashboardTiles.position));
}

export async function getDashboard(user: AppUser, id: string) {
  if (!z.uuid().safeParse(id).success) throw notFound("Dashboard");
  const [d] = await db
    .select()
    .from(schema.dashboards)
    .where(and(eq(schema.dashboards.id, id), eq(schema.dashboards.ownerId, user.id)))
    .limit(1);
  if (!d) throw notFound("Dashboard");
  return { ...d, tiles: await tilesOf(d.id) };
}

/** Public read-only view by share token. Tokens are 24 random bytes; anything else is a 404. */
export async function getSharedDashboard(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw notFound("Dashboard");
  const [d] = await db.select().from(schema.dashboards).where(eq(schema.dashboards.shareToken, token)).limit(1);
  if (!d) throw notFound("Dashboard");
  return { id: d.id, title: d.title, description: d.description, ownerId: d.ownerId, updatedAt: d.updatedAt, tiles: await tilesOf(d.id) };
}

export async function deleteDashboard(user: AppUser, id: string) {
  await getDashboard(user, id);
  await db.delete(schema.dashboards).where(eq(schema.dashboards.id, id));
}

export async function setSharing(user: AppUser, id: string, enabled: boolean) {
  await getDashboard(user, id);
  const token = enabled ? randomBytes(24).toString("base64url") : null;
  await db.update(schema.dashboards).set({ shareToken: token, updatedAt: new Date() }).where(eq(schema.dashboards.id, id));
  return token;
}

export const tileInput = z.object({ dashboardId: z.uuid(), queryId: z.uuid(), width: z.coerce.number().int().min(1).max(2).default(1) });

export async function addTile(user: AppUser, raw: unknown) {
  const input = tileInput.parse(raw);
  await getDashboard(user, input.dashboardId);
  await getQuery(user, input.queryId);
  const [{ next } = { next: 0 }] = await db
    .select({ next: sql<number>`coalesce(${max(schema.dashboardTiles.position)}, -1)::int + 1` })
    .from(schema.dashboardTiles)
    .where(eq(schema.dashboardTiles.dashboardId, input.dashboardId));
  await db.insert(schema.dashboardTiles).values({ dashboardId: input.dashboardId, queryId: input.queryId, position: next, width: input.width }).onConflictDoNothing();
  await db.update(schema.dashboards).set({ updatedAt: new Date() }).where(eq(schema.dashboards.id, input.dashboardId));
}

export async function removeTile(user: AppUser, dashboardId: string, queryId: string) {
  await getDashboard(user, dashboardId);
  await db.delete(schema.dashboardTiles).where(and(eq(schema.dashboardTiles.dashboardId, dashboardId), eq(schema.dashboardTiles.queryId, queryId)));
}

/** Swap a tile with its neighbour (direction -1 = earlier, 1 = later). */
export async function moveTile(user: AppUser, dashboardId: string, queryId: string, direction: -1 | 1) {
  const d = await getDashboard(user, dashboardId);
  const i = d.tiles.findIndex((t) => t.queryId === queryId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= d.tiles.length) return;
  const order = [...d.tiles];
  [order[i], order[j]] = [order[j]!, order[i]!];
  await db.transaction(async (tx) => {
    for (const [pos, t] of order.entries()) {
      await tx
        .update(schema.dashboardTiles)
        .set({ position: pos })
        .where(and(eq(schema.dashboardTiles.dashboardId, dashboardId), eq(schema.dashboardTiles.queryId, t.queryId)));
    }
  });
}

export async function setTileWidth(user: AppUser, dashboardId: string, queryId: string, width: 1 | 2) {
  await getDashboard(user, dashboardId);
  await db
    .update(schema.dashboardTiles)
    .set({ width })
    .where(and(eq(schema.dashboardTiles.dashboardId, dashboardId), eq(schema.dashboardTiles.queryId, queryId)));
}

export interface TileResult {
  queryId: string;
  title: string;
  width: number;
  chart: ChartSpec;
  result: QueryResult | null;
  error: string | null;
}

/** Run every tile through the guarded executor (sequentially: PGlite is single-connection anyway). */
export async function runTiles(tiles: Awaited<ReturnType<typeof tilesOf>>, ctx: { userId: string | null; source: RunSource }): Promise<TileResult[]> {
  const out: TileResult[] = [];
  for (const t of tiles) {
    try {
      out.push({ queryId: t.queryId, title: t.title, width: t.width, chart: t.chart, result: await runReadOnly(t.sql, { ...ctx, question: t.question }), error: null });
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(`[tiles] query ${t.queryId} failed`, err);
      out.push({ queryId: t.queryId, title: t.title, width: t.width, chart: t.chart, result: null, error: err instanceof HttpError ? err.message : "This tile couldn't be loaded." });
    }
  }
  return out;
}

/** Which of the user's dashboards already contain a query (for the "Add to dashboard" menu). */
export async function dashboardsContaining(user: AppUser, queryId: string) {
  const mine = await listDashboards(user);
  if (!mine.length) return { dashboards: mine, containing: new Set<string>() };
  const rows = await db
    .select({ dashboardId: schema.dashboardTiles.dashboardId })
    .from(schema.dashboardTiles)
    .where(and(eq(schema.dashboardTiles.queryId, queryId), inArray(schema.dashboardTiles.dashboardId, mine.map((d) => d.id))));
  return { dashboards: mine, containing: new Set(rows.map((r) => r.dashboardId)) };
}

/* ------------------------------------------------------------------ audit log (admin) */

export async function listRuns(limit = 100) {
  return db
    .select({
      id: schema.queryRuns.id,
      source: schema.queryRuns.source,
      question: schema.queryRuns.question,
      sql: schema.queryRuns.sql,
      status: schema.queryRuns.status,
      reason: schema.queryRuns.reason,
      rowCount: schema.queryRuns.rowCount,
      durationMs: schema.queryRuns.durationMs,
      createdAt: schema.queryRuns.createdAt,
      userName: schema.user.name,
    })
    .from(schema.queryRuns)
    .leftJoin(schema.user, eq(schema.user.id, schema.queryRuns.userId))
    .orderBy(desc(schema.queryRuns.createdAt))
    .limit(limit);
}

export async function runStats() {
  const [r] = await db
    .select({
      total: sql<number>`count(*)::int`,
      ok: sql<number>`count(*) filter (where status = 'ok')::int`,
      rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
      errors: sql<number>`count(*) filter (where status = 'error')::int`,
    })
    .from(schema.queryRuns)
    .where(sql`${schema.queryRuns.createdAt} > now() - interval '7 days'`);
  const ai = await db
    .select({ feature: schema.aiUsage.feature, calls: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where ok = 0)::int`, avgMs: sql<number>`round(avg(latency_ms))::int` })
    .from(schema.aiUsage)
    .where(sql`${schema.aiUsage.createdAt} > now() - interval '7 days'`)
    .groupBy(schema.aiUsage.feature);
  return { runs: r ?? { total: 0, ok: 0, rejected: 0, errors: 0 }, ai };
}

/** Public link of the seeded example dashboard (for the landing page), if it is shared. */
export async function exampleShareToken() {
  const [row] = await db
    .select({ token: schema.dashboards.shareToken })
    .from(schema.dashboards)
    .where(sql`${schema.dashboards.shareToken} is not null and ${schema.dashboards.title} = 'Sales overview (example)'`)
    .limit(1);
  return row?.token ?? null;
}
