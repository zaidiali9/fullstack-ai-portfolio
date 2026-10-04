import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * One Drizzle API, two drivers:
 *  - DATABASE_URL set  -> postgres-js (Neon, Supabase, docker-compose Postgres)
 *  - DATABASE_URL unset -> PGlite (Postgres 18 in WASM + pgvector) stored in a local folder.
 * The PGlite instance is typed as the postgres-js database; the query builder API is identical.
 * Avoid `db.execute()` result shapes in app code (they differ per driver) — use `rowsOf()`.
 */
export type Database<S extends Record<string, unknown>> = PostgresJsDatabase<S>;

export interface DbHandle<S extends Record<string, unknown>> {
  db: Database<S>;
  driver: "postgres" | "pglite";
  migrate(migrationsFolder: string): Promise<void>;
  close(): Promise<void>;
}

export interface DbOptions {
  /** Postgres connection string; when empty, PGlite is used. */
  url?: string;
  /** PGlite data directory, or "memory://" for an in-memory database (tests). */
  dataDir: string;
  /** postgres-js pool size (keep small for serverless). */
  max?: number;
}

const g = globalThis as unknown as { __portfolioDb?: Map<string, DbHandle<Record<string, unknown>>> };
const cache = (g.__portfolioDb ??= new Map());

export function createDatabase<S extends Record<string, unknown>>(schema: S, opts: DbOptions): DbHandle<S> {
  const key = opts.url || opts.dataDir;
  const existing = cache.get(key);
  if (existing) return existing as unknown as DbHandle<S>;

  let handle: DbHandle<S>;
  if (opts.url) {
    const client = postgres(opts.url, { max: opts.max ?? 5, prepare: false, onnotice: () => {} });
    handle = {
      db: drizzlePostgres(client, { schema }),
      driver: "postgres",
      migrate: async (migrationsFolder) => {
        const migrator = postgres(opts.url!, { max: 1, onnotice: () => {} });
        try {
          await migratePostgres(drizzlePostgres(migrator), { migrationsFolder });
        } finally {
          await migrator.end();
        }
      },
      close: () => client.end(),
    };
  } else {
    const inMemory = opts.dataDir.startsWith("memory://");
    if (!inMemory) acquireLock(opts.dataDir);
    const client = new PGlite(inMemory ? "memory://" : opts.dataDir, { extensions: { vector } });
    handle = {
      db: drizzlePglite(client, { schema }) as unknown as Database<S>,
      driver: "pglite",
      migrate: async (migrationsFolder) => {
        await client.exec("CREATE EXTENSION IF NOT EXISTS vector;");
        await migratePglite(drizzlePglite(client), { migrationsFolder });
      },
      close: async () => {
        await client.close();
        cache.delete(key);
        if (!inMemory) releaseLock(opts.dataDir);
      },
    };
  }
  cache.set(key, handle as unknown as DbHandle<Record<string, unknown>>);
  return handle;
}

/**
 * Lazily created database: nothing connects until the first query, so `next build` and
 * modules that merely import `db` never open (and lock) the PGlite folder.
 */
export function lazyDatabase<S extends Record<string, unknown>>(factory: () => DbHandle<S>): { db: Database<S>; handle: () => DbHandle<S> } {
  let h: DbHandle<S> | undefined;
  const handle = () => (h ??= factory());
  const db = new Proxy({} as Database<S>, {
    get(_t, prop) {
      const real = handle().db as unknown as Record<string | symbol, unknown>;
      const value = real[prop];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
    },
  });
  return { db, handle };
}

/** Normalize `db.execute()` results: postgres-js returns an array, PGlite returns `{ rows }`. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

// PGlite is single-process. A lock file next to the data folder turns silent corruption
// (two processes writing the same files) into a clear error message.
const lockPath = (dataDir: string) => `${path.resolve(dataDir)}.lock`;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function acquireLock(dataDir: string) {
  const file = lockPath(dataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const pid = Number(fs.readFileSync(file, "utf8"));
    if (pid && pid !== process.pid && pidAlive(pid)) {
      throw new Error(
        `The local PGlite database at ${dataDir} is in use by another process (pid ${pid}). ` +
          `Stop that process (e.g. the dev server) before running this command, or set DATABASE_URL to use a Postgres server.`,
      );
    }
  }
  fs.writeFileSync(file, String(process.pid));
  process.once("exit", () => releaseLock(dataDir));
}

function releaseLock(dataDir: string) {
  try {
    const file = lockPath(dataDir);
    if (fs.existsSync(file) && Number(fs.readFileSync(file, "utf8")) === process.pid) fs.unlinkSync(file);
  } catch {
    /* best effort */
  }
}
