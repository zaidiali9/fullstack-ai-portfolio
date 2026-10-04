import path from "node:path";
import { beforeAll } from "vitest";
import { dbHandle } from "@/db";

// Each test file runs in its own process with a fresh in-memory PGlite database,
// migrated with the same committed SQL migrations used in production.
beforeAll(async () => {
  await dbHandle().migrate(path.resolve(__dirname, "../../drizzle/migrations"));
});
