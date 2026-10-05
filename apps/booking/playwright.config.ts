import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3104);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * E2E runs against a production build (`npm run build` first) with a fresh PGlite database
 * seeded by scripts/e2e-server.mjs. AI calls use the labeled STUB provider (AI_PROVIDER=stub),
 * so tests are deterministic; tests that rely on it say "(stub AI)" in their title.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Locally use the installed Chrome; CI installs Playwright's Chromium.
    ...(process.env.CI ? {} : { channel: "chrome" }),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...(process.env.CI ? {} : { channel: "chrome" }) }, testIgnore: /screenshots/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "node scripts/e2e-server.mjs",
        url: `${baseURL}/api/health`,
        timeout: 180_000,
        reuseExistingServer: false,
        stdout: "pipe",
        env: {
          E2E_PORT: String(PORT),
          APP_URL: baseURL,
          PGLITE_DIR: ".data/e2e",
          DATABASE_URL: "",
          AI_PROVIDER: "stub",
          AI_EMBED_PROVIDER: "auto",
          AI_LOCAL_MODELS: "false",
          E2E: "1",
          // Many sign-ins from one IP during the suite; production default is 5/min.
          AUTH_SIGNIN_PER_MINUTE: "500",
          BETTER_AUTH_SECRET: "e2e-only-secret-not-for-production-0123456789",
          NODE_ENV: "production",
        },
      },
});
