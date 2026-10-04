/* Apply committed migrations to DATABASE_URL (Postgres) or the local PGlite folder. */
import path from "node:path";
import { createDatabase } from "@portfolio/kit/db";
import * as schema from "./schema";

const url = process.env.DATABASE_URL?.trim() || undefined;
const dataDir = path.resolve(process.cwd(), process.env.PGLITE_DIR ?? ".data/pglite");
const handle = createDatabase(schema, { url, dataDir });

const started = Date.now();
await handle.migrate(path.resolve(import.meta.dirname, "migrations"));
console.log(`Migrations applied (${handle.driver}${url ? "" : ` at ${dataDir}`}) in ${Date.now() - started}ms`);
await handle.close();
