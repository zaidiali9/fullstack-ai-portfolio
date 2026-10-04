import { defineConfig } from "@playwright/test";

/**
 * README screenshots, captured from a RUNNING app (default http://localhost:3002) seeded with
 * `npm run db:seed -- --with-ai` and a real AI provider configured, so every AI output in the
 * images comes from a real model call. Not part of CI.
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /screenshots\.spec\.ts/,
  timeout: 300_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3002", ...(process.env.CI ? {} : { channel: "chrome" }) },
});
