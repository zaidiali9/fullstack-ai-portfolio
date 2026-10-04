import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AIError } from "@portfolio/ai";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { action, createDatabase, enforceRateLimit, HttpError, rateLimit, rowsOf, securityHeaders, toErrorPayload } from "../src";
import * as schema from "../src/schema";

describe("rate limiter (PGlite in-memory)", () => {
  const h = createDatabase(schema, { dataDir: "memory://kit-test" });
  beforeAll(async () => {
    await h.db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await h.db.execute(sql`CREATE TABLE rate_limits (key text primary key, count integer not null, window_start timestamptz not null)`);
  });
  afterAll(() => h.close());

  it("allows up to the limit then blocks", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(h.db, "login:1.2.3.4", { limit: 3, windowMs: 60_000 }));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results[2]!.remaining).toBe(0);
  });

  it("keys are independent", async () => {
    expect((await rateLimit(h.db, "login:other", { limit: 1, windowMs: 60_000 })).ok).toBe(true);
  });

  it("resets after the window expires", async () => {
    await rateLimit(h.db, "ai:u1", { limit: 1, windowMs: 60_000 });
    expect((await rateLimit(h.db, "ai:u1", { limit: 1, windowMs: 60_000 })).ok).toBe(false);
    await h.db.execute(sql`UPDATE rate_limits SET window_start = now() - interval '2 minutes' WHERE key = 'ai:u1'`);
    expect((await rateLimit(h.db, "ai:u1", { limit: 1, windowMs: 60_000 })).ok).toBe(true);
  });

  it("enforceRateLimit throws 429 with retry-after", async () => {
    await enforceRateLimit(h.db, "x", { limit: 1, windowMs: 30_000 });
    const err = await enforceRateLimit(h.db, "x", { limit: 1, windowMs: 30_000 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(429);
    expect(Number((err as HttpError).headers?.["retry-after"])).toBeGreaterThan(0);
  });

  it("rowsOf normalizes PGlite results", async () => {
    expect(rowsOf<{ n: number }>(await h.db.execute(sql`select 1 as n`))).toEqual([{ n: 1 }]);
    expect(rowsOf([{ n: 2 }])).toEqual([{ n: 2 }]);
  });

  it("supports pgvector", async () => {
    const r = rowsOf<{ d: number }>(await h.db.execute(sql`select '[1,0]'::vector <=> '[0,1]'::vector as d`));
    expect(r[0]!.d).toBeCloseTo(1);
  });
});

describe("PGlite lock file", () => {
  it("refuses to open a data dir held by another live process", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kit-lock-"));
    const dataDir = path.join(dir, "db");
    // Pretend the parent process (alive) holds the lock.
    fs.writeFileSync(`${dataDir}.lock`, String(process.ppid));
    expect(() => createDatabase(schema, { dataDir })).toThrow(/in use by another process/);
  });
});

describe("error payloads", () => {
  it("never leaks unknown errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const p = toErrorPayload(new Error("password=hunter2 at db.ts:12"));
    spy.mockRestore();
    expect(p.status).toBe(500);
    expect(JSON.stringify(p.body)).not.toContain("hunter2");
    expect(p.body.error.requestId).toHaveLength(8);
  });
  it("maps zod, http and AI errors", () => {
    const zerr = z.object({ email: z.email() }).safeParse({ email: "nope" }).error!;
    expect(toErrorPayload(zerr)).toMatchObject({ status: 400, body: { error: { code: "validation_error", issues: { email: expect.any(Array) } } } });
    expect(toErrorPayload(new HttpError(403, "forbidden", "no")).status).toBe(403);
    expect(toErrorPayload(new AIError("unavailable", "AI unavailable")).status).toBe(503);
    expect(toErrorPayload(new AIError("rate_limited", "busy")).body.error.code).toBe("ai_rate_limited");
  });
  it("action() wraps results and rethrows Next redirects", async () => {
    expect(await action(async () => 5)).toEqual({ ok: true, data: 5 });
    expect(await action(async () => { throw new HttpError(404, "not_found", "x"); })).toMatchObject({ ok: false, error: { code: "not_found" } });
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    await expect(action(async () => { throw redirect; })).rejects.toBe(redirect);
  });
});

describe("security headers", () => {
  it("denies framing by default and sets HSTS in production", () => {
    const h = Object.fromEntries(securityHeaders().map((x) => [x.key, x.value]));
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).not.toContain("unsafe-eval");
    expect(h["Strict-Transport-Security"]).toBeDefined();
  });
  it("allows configured frame ancestors for widgets", () => {
    const h = Object.fromEntries(securityHeaders({ frameAncestors: ["*"], isDev: true }).map((x) => [x.key, x.value]));
    expect(h["X-Frame-Options"]).toBeUndefined();
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors *");
    expect(h["Strict-Transport-Security"]).toBeUndefined();
  });
});
