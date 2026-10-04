import "server-only";
import { createDatabase, lazyDatabase } from "@portfolio/kit/db";
import * as schema from "@db/schema";
import { env } from "@/lib/env";

const lazy = lazyDatabase(() =>
  createDatabase(schema, {
    url: env().DATABASE_URL,
    // Relative paths resolve against the working directory (the app folder).
    dataDir: env().PGLITE_DIR,
  }),
);

/** Drizzle database: Postgres when DATABASE_URL is set, otherwise local PGlite. */
export const db = lazy.db;
export const dbHandle = lazy.handle;
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
