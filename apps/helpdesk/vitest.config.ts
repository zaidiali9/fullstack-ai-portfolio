import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@db": path.resolve(__dirname, "drizzle"),
      // server-only throws outside React Server Components; tests call server code directly.
      "server-only": path.resolve(__dirname, "tests/unit/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
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
