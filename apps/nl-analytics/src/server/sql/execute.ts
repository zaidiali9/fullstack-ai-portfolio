import "server-only";
import { sql as dsql } from "drizzle-orm";
import { HttpError } from "@portfolio/kit";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { guardSql } from "./guard";

export type ColumnKind = "number" | "text" | "date" | "boolean";
export interface QueryResult {
  columns: { name: string; kind: ColumnKind }[];
  rows: (string | number | boolean | null)[][];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  tables: string[];
  sql: string;
}

export type RunSource = "ai" | "manual" | "saved" | "dashboard" | "shared" | "export" | "eval";

const NUMERIC_OIDS = new Set([20, 21, 23, 700, 701, 1700]);
const DATE_OIDS = new Set([1082]);
const TIMESTAMP_OIDS = new Set([1114, 1184]);
const BOOL_OIDS = new Set([16]);

interface Field {
  name: string;
  oid: number;
}

/** Column metadata from either driver: PGlite returns { fields }, postgres-js an array with .columns. */
function fieldsOf(result: unknown): Field[] {
  const r = result as { fields?: { name: string; dataTypeID: number }[]; columns?: { name: string; type: number }[] };
  if (Array.isArray(r.fields)) return r.fields.map((f) => ({ name: f.name, oid: f.dataTypeID }));
  if (Array.isArray(r.columns)) return r.columns.map((c) => ({ name: c.name, oid: c.type }));
  return [];
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  return ((result as { rows?: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];
}

const pad = (n: number) => String(n).padStart(2, "0");

function convert(value: unknown, oid: number): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (NUMERIC_OIDS.has(oid)) {
    const n = typeof value === "bigint" ? Number(value) : Number(value);
    return Number.isFinite(n) ? n : String(value);
  }
  if (DATE_OIDS.has(oid)) {
    if (value instanceof Date) return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
    return String(value).slice(0, 10);
  }
  if (TIMESTAMP_OIDS.has(oid)) {
    // Drivers return Date objects or strings like "2026-01-01 00:00:00+00" (session time zone is UTC).
    const d = value instanceof Date ? value : new Date(String(value).replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
    if (Number.isNaN(d.getTime())) return String(value);
    const iso = d.toISOString();
    // Midnight UTC (e.g. date_trunc('month', ...)) reads better as a plain date.
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (BOOL_OIDS.has(oid)) return Boolean(value);
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

const kindOf = (oid: number): ColumnKind => (NUMERIC_OIDS.has(oid) ? "number" : DATE_OIDS.has(oid) || TIMESTAMP_OIDS.has(oid) ? "date" : BOOL_OIDS.has(oid) ? "boolean" : "text");

let roleUsable: Promise<boolean> | undefined;
/** Can this connection SET ROLE analytics_reader? (Always on PGlite; on Postgres it needs the migration's grant.) */
export function readerRoleUsable() {
  roleUsable ??= db
    .execute(dsql`select exists (select 1 from pg_roles where rolname = 'analytics_reader') and pg_has_role(current_user, 'analytics_reader', 'MEMBER') as ok`)
    .then((r) => Boolean(rowsOf(r)[0]?.ok))
    .then((ok) => {
      if (!ok) console.warn("[sql] analytics_reader role not usable; relying on the guard + read-only transaction only");
      return ok;
    })
    .catch(() => false);
  return roleUsable;
}

/** Postgres error text is safe to show for the user's own query; anything else gets a generic message. */
function dbMessage(err: unknown): string {
  let e: unknown = err;
  for (let i = 0; i < 4 && e && typeof e === "object"; i++) {
    const { code, message } = e as { code?: unknown; message?: unknown };
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) && typeof message === "string") return message;
    e = (e as { cause?: unknown }).cause;
  }
  return "the database could not run this query";
}

async function audit(entry: { userId: string | null; source: RunSource; question?: string; sql: string; status: "ok" | "rejected" | "error"; reason?: string; rowCount?: number; durationMs: number }) {
  await db
    .insert(schema.queryRuns)
    .values({ ...entry, question: entry.question ?? "", sql: entry.sql.slice(0, 4000), reason: entry.reason?.slice(0, 500) ?? null, rowCount: entry.rowCount ?? null })
    .catch((err) => console.error("[sql] audit failed", err));
}

/**
 * Run SQL from a user or the model. Layers, in order:
 *   1. parser-based allowlist guard (guard.ts)
 *   2. wrapped as `SELECT * FROM (<query>) LIMIT max+1` and re-guarded
 *   3. READ ONLY transaction, statement_timeout, search_path = demo, SET ROLE analytics_reader
 *   4. EXPLAIN cost ceiling (PGlite ignores statement_timeout, so this is what stops runaway joins there)
 *   5. app-level timeout and row cap
 * Every attempt is written to query_runs.
 */
export async function runReadOnly(input: string, ctx: { userId: string | null; source: RunSource; question?: string }): Promise<QueryResult> {
  const started = Date.now();
  const g = await guardSql(input);
  if (!g.ok) {
    await audit({ userId: ctx.userId, source: ctx.source, question: ctx.question, sql: input.slice(0, 4000), status: "rejected", reason: g.reason, durationMs: Date.now() - started });
    throw new HttpError(422, "sql_rejected", g.reason, { details: { guard: g.code } });
  }
  const { QUERY_MAX_ROWS: maxRows, QUERY_TIMEOUT_MS: timeoutMs, QUERY_MAX_COST: maxCost } = env();
  const wrapped = `SELECT * FROM (\n${g.sql}\n) AS tally_result LIMIT ${maxRows + 1}`;
  const g2 = await guardSql(wrapped);
  if (!g2.ok) {
    await audit({ userId: ctx.userId, source: ctx.source, question: ctx.question, sql: g.sql, status: "rejected", reason: g2.reason, durationMs: Date.now() - started });
    throw new HttpError(422, "sql_rejected", "The query could not be safely wrapped. Remove trailing comments and try again.");
  }
  const useRole = await readerRoleUsable();

  const work = db.transaction(async (tx) => {
    await tx.execute(dsql.raw("SET TRANSACTION READ ONLY"));
    await tx.execute(dsql.raw(`SET LOCAL statement_timeout = ${Math.floor(timeoutMs)}`));
    await tx.execute(dsql.raw("SET LOCAL search_path = demo"));
    // Same answers on every server: CURRENT_DATE, date_trunc and timestamps are evaluated in UTC.
    await tx.execute(dsql.raw("SET LOCAL TIME ZONE 'UTC'"));
    if (useRole) await tx.execute(dsql.raw("SET LOCAL ROLE analytics_reader"));
    const plan = rowsOf(await tx.execute(dsql.raw(`EXPLAIN (FORMAT JSON) ${wrapped}`)))[0] as Record<string, unknown> | undefined;
    const planJson = plan ? Object.values(plan)[0] : null;
    const parsed = (typeof planJson === "string" ? JSON.parse(planJson) : planJson) as { Plan?: { "Total Cost"?: number } }[] | null;
    const cost = parsed?.[0]?.Plan?.["Total Cost"] ?? 0;
    if (cost > maxCost) throw new HttpError(422, "sql_too_expensive", `This query is too expensive to run (estimated cost ${Math.round(cost).toLocaleString("en-US")}, limit ${maxCost.toLocaleString("en-US")}). Add filters or aggregate before joining.`);
    return tx.execute(dsql.raw(wrapped));
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HttpError(422, "sql_timeout", `The query took longer than ${timeoutMs / 1000} seconds.`)), timeoutMs + 500);
  });

  let result: unknown;
  try {
    result = await Promise.race([work, timeout]);
  } catch (err) {
    const reason = err instanceof HttpError ? err.message : `The database rejected the query: ${dbMessage(err)}`;
    // On a timeout PGlite is still busy with the query, so don't wait for the audit insert.
    const write = audit({ userId: ctx.userId, source: ctx.source, question: ctx.question, sql: g.sql, status: err instanceof HttpError && err.code === "sql_too_expensive" ? "rejected" : "error", reason, durationMs: Date.now() - started });
    if (!(err instanceof HttpError && err.code === "sql_timeout")) await write;
    if (err instanceof HttpError) throw err;
    throw new HttpError(422, "sql_error", reason);
  } finally {
    clearTimeout(timer);
  }

  const fields = fieldsOf(result);
  const names = fields.map((f) => f.name);
  if (new Set(names).size !== names.length) {
    const reason = "Two result columns have the same name. Give every column a unique alias (e.g. AS revenue).";
    await audit({ userId: ctx.userId, source: ctx.source, question: ctx.question, sql: g.sql, status: "error", reason, durationMs: Date.now() - started });
    throw new HttpError(422, "sql_duplicate_columns", reason);
  }
  const raw = rowsOf(result);
  const truncated = raw.length > maxRows;
  const rows = raw.slice(0, maxRows).map((r) => fields.map((f) => convert(r[f.name], f.oid)));
  const durationMs = Date.now() - started;
  await audit({ userId: ctx.userId, source: ctx.source, question: ctx.question, sql: g.sql, status: "ok", rowCount: rows.length, durationMs });
  return { columns: fields.map((f) => ({ name: f.name, kind: kindOf(f.oid) })), rows, rowCount: rows.length, truncated, durationMs, tables: g.tables, sql: g.sql };
}
