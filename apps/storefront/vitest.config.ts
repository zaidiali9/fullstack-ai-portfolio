import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@db": path.resolve(import.meta.dirname, "drizzle"),
      // server-only throws outside React Server Components; tests call server code directly.
      "server-only": path.resolve(import.meta.dirname, "tests/unit/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    setupFiles: ["tests/unit/setup.ts"],
    env: {
      NODE_ENV: "test",
      PGLITE_DIR: "memory://",
      // Labeled STUB provider: deterministic wiring tests, never used for metrics or evals.
      AI_PROVIDER: "stub",
      APP_URL: "http://localhost:3003",
      STRIPE_SECRET_KEY: "sk_test_unit_dummy",
      STRIPE_WEBHOOK_SECRET: "whsec_unit_test_secret",
    },
    hookTimeout: 60_000,
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["src/server/**", "src/lib/**"],
      exclude: ["src/lib/auth-client.ts", "**/*.d.ts"],
      reporter: ["text-summary", "json-summary", "html"],
    },
  },
});
