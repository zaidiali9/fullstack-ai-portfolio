import { defineConfig } from "drizzle-kit";

// Migrations are generated from the schema and committed; they run on PGlite and Postgres alike.
export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  strict: true,
  verbose: true,
});
