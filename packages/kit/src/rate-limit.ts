import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { HttpError } from "./errors";
import { rateLimits } from "./schema";

// Any Drizzle Postgres database (postgres-js or PGlite).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<PgQueryResultHKT, any>;

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

/**
 * Fixed-window limiter stored in Postgres, so it holds across serverless instances.
 * One atomic upsert per check: resets the window when it has expired, otherwise increments.
 */
export async function rateLimit(db: AnyDb, key: string, opts: { limit: number; windowMs: number }): Promise<RateLimitResult> {
  const windowSec = opts.windowMs / 1000;
  const expired = sql`${rateLimits.windowStart} <= now() - make_interval(secs => ${windowSec})`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStart: sql`now()` })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${expired} THEN now() ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });
  const count = row?.count ?? 1;
  const start = row?.windowStart ? new Date(row.windowStart) : new Date();
  return {
    ok: count <= opts.limit,
    limit: opts.limit,
    remaining: Math.max(0, opts.limit - count),
    resetAt: new Date(start.getTime() + opts.windowMs),
  };
}

/** Throw HTTP 429 when the limit is exceeded. */
export async function enforceRateLimit(db: AnyDb, key: string, opts: { limit: number; windowMs: number; message?: string }) {
  const r = await rateLimit(db, key, opts);
  if (!r.ok) {
    const retryAfter = Math.max(1, Math.ceil((r.resetAt.getTime() - Date.now()) / 1000));
    throw new HttpError(429, "rate_limited", opts.message ?? "Too many requests. Please wait and try again.", {
      headers: { "retry-after": String(retryAfter) },
    });
  }
  return r;
}

/** Best-effort client IP for anonymous rate-limit keys (trusts the platform proxy headers). */
export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
