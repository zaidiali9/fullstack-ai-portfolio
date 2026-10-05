import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

type Role = "analyst" | "admin";
const DEMO_BUTTON: Record<Role, string> = { analyst: "Analyst (Sasha)", admin: "Admin (Rowan)" };

async function signIn(page: Page, role: Role, next = "/ask") {
  await page.goto(`/sign-in?demo=${role}&next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
}

async function asUser(browser: Browser, role: Role, next?: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, role, next);
  return { ctx, page };
}

async function ask(page: Page, question: string) {
  await page.getByLabel("Ask a question about the data").fill(question);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
}

test.describe.configure({ mode: "serial" });

test("public: landing page links to a shared read-only dashboard with charts and CSV", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ask your data in plain English");
  await page.getByRole("link", { name: "See a shared dashboard" }).click();
  await expect(page.getByText("Shared dashboard · read-only")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales overview (example)" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(page.locator("svg.recharts-surface").first()).toBeVisible();
  // No editing controls for visitors.
  await page.getByRole("button", { name: "Options for Orders by sales channel" }).click();
  await expect(page.getByRole("menuitem", { name: "Remove from dashboard" })).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download CSV" }).click();
  const file = await (await download).path();
  const { readFileSync } = await import("node:fs");
  expect(readFileSync(file!, "utf8")).toMatch(/^﻿sales_channel,orders\r\n/);
});

test("analyst asks a question, sees chart + SQL, saves it and pins it to a dashboard (stub AI)", async ({ page }) => {
  await signIn(page, "analyst");
  await ask(page, "Revenue by region");
  await expect(page.getByRole("heading", { name: "[stub] Revenue by region" })).toBeVisible();
  await expect(page.getByText("AI-generated SQL · stub")).toBeVisible();
  await expect(page.locator("pre code")).toContainText("FROM demo.orders o JOIN demo.customers");
  await expect(page.locator("svg.recharts-surface")).toBeVisible();
  await page.getByRole("tab", { name: "table" }).click();
  await expect(page.getByRole("columnheader", { name: "region" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "North America" })).toBeVisible();

  await page.getByRole("button", { name: "Save" }).click();
  await page.getByLabel("Title").fill("Revenue by region (e2e)");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Query saved.")).toBeVisible();

  await page.goto("/dashboards");
  await page.getByLabel("New dashboard").fill("E2E board");
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/dashboards\/[0-9a-f-]{36}$/);
  const dashboardUrl = page.url();

  await page.goto("/queries");
  await page.getByRole("link", { name: /Revenue by region \(e2e\)/ }).click();
  await expect(page.getByLabel("Title")).toHaveValue("Revenue by region (e2e)");
  await page.getByRole("button", { name: "Add to dashboard" }).click();
  await page.getByRole("menuitem", { name: "E2E board" }).click();
  await expect(page.getByText("Added to “E2E board”.")).toBeVisible();
  await page.goto(dashboardUrl);
  await expect(page.getByRole("article", { name: "Revenue by region (e2e)" })).toBeVisible();
});

test("unsafe model SQL is rejected and shown, never run (stub AI)", async ({ page }) => {
  await signIn(page, "analyst");
  await ask(page, "Please drop the orders table");
  await expect(page.getByRole("alert")).toContainText("Only SELECT queries are allowed");
  await expect(page.locator("pre code")).toHaveText("DROP TABLE demo.orders");
  await expect(page.getByText("Fixed after")).toHaveCount(0);
  // The data is still there.
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("SQL query").fill("SELECT count(*) AS orders FROM demo.orders");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText("Your SQL")).toBeVisible();
  await expect(page.locator("p.font-heading")).toHaveText(/^[1-9][\d,]*$/);
});

test("hand-edited SQL goes through the same guard; results export to CSV", async ({ page }) => {
  await signIn(page, "analyst");
  await ask(page, "monthly revenue");
  await expect(page.locator("svg.recharts-surface")).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("SQL query").fill("SELECT status, count(*) AS n FROM demo.orders GROUP BY status ORDER BY n DESC");
  await page.getByRole("button", { name: "Run" }).click();
  await page.getByRole("tab", { name: "table" }).click();
  await expect(page.getByRole("cell", { name: "completed" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV" }).click();
  const { readFileSync } = await import("node:fs");
  expect(readFileSync((await (await download).path())!, "utf8")).toMatch(/^﻿status,n\r\ncompleted,\d+/);

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("SQL query").fill("SELECT email, password FROM public.account");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("alert")).toContainText('Table "public.account" is not part of the dataset');
});

test("summary is labelled AI and number-checked (stub AI)", async ({ page }) => {
  await signIn(page, "analyst");
  await ask(page, "revenue by region");
  await page.getByRole("button", { name: "Summarize" }).click();
  await expect(page.getByLabel("AI summary")).toContainText("[stub] Summary placeholder");
  await expect(page.getByText("Every number in this summary appears in the result.")).toBeVisible();
  await expect(page.getByText("AI-generated by stub · stub-model.")).toBeVisible();
});

test("sharing a dashboard creates a public link that stops working when revoked", async ({ browser }) => {
  const { ctx, page } = await asUser(browser, "analyst", "/dashboards");
  await page.getByRole("link", { name: /E2E board/ }).click();
  await page.getByRole("button", { name: "Create public link" }).click();
  const link = await page.getByLabel("Public link").inputValue();
  expect(link).toMatch(/\/shared\/[A-Za-z0-9_-]{32}$/);

  const visitor = await browser.newPage();
  await visitor.goto(new URL(link).pathname);
  await expect(visitor.getByRole("heading", { name: "E2E board" })).toBeVisible();
  await expect(visitor.getByRole("button", { name: "Stop sharing" })).toHaveCount(0);

  await page.getByRole("button", { name: "Stop sharing" }).click();
  await expect(page.getByText("Private — only you can see this dashboard")).toBeVisible();
  expect((await visitor.goto(new URL(link).pathname))?.status()).toBe(404);
  await visitor.close();
  await ctx.close();
});

test("admin sees the audit log incl. rejected SQL; analysts get 404", async ({ browser }) => {
  const admin = await asUser(browser, "admin", "/admin");
  await expect(admin.page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(admin.page.getByText("DROP TABLE demo.orders").first()).toBeVisible();
  await expect(admin.page.getByText("rejected", { exact: true }).first()).toBeVisible();
  await admin.ctx.close();
  const analyst = await asUser(browser, "analyst");
  expect((await analyst.page.goto("/admin"))?.status()).toBe(404);
  await analyst.ctx.close();
});

test("API guards: auth, same-origin, validation, no stack traces", async ({ request, baseURL }) => {
  expect((await request.post("/api/ask", { data: { question: "revenue" }, headers: { origin: baseURL! } })).status()).toBe(401);
  expect((await request.post("/api/run", { data: { sql: "SELECT 1" }, headers: { origin: "https://evil.example" } })).status()).toBe(403);
  expect((await request.get("/api/shared/not-a-real-token-123456/csv?query=x")).status()).toBe(404);
  expect((await request.get("/shared/nope")).status()).toBe(404);
  const health = await (await request.get("/api/health")).json();
  expect(health).toMatchObject({ status: "ok", database: "ok" });
});

test("signed-in API: DROP via /api/run is a 422 with a readable reason", async ({ browser, baseURL }) => {
  const { ctx, page } = await asUser(browser, "analyst");
  const res = await page.request.post("/api/run", { data: { sql: "DROP TABLE demo.orders" }, headers: { origin: baseURL! } });
  expect(res.status()).toBe(422);
  const body = await res.json();
  expect(body.error.message).toBe("Only SELECT queries are allowed (the data is read-only).");
  expect(JSON.stringify(body)).not.toContain("stack");
  await ctx.close();
});

test.describe("accessibility and responsive layout", () => {
  const pages = [
    { name: "landing", path: "/", role: null },
    { name: "ask", path: "/ask", role: "analyst" as const },
    { name: "saved queries", path: "/queries", role: "analyst" as const },
    { name: "dashboards", path: "/dashboards", role: "analyst" as const },
    { name: "admin", path: "/admin", role: "admin" as const },
  ];
  for (const p of pages) {
    test(`${p.name}: no axe violations (WCAG 2 A/AA)`, async ({ page }) => {
      if (p.role) await signIn(page, p.role, p.path);
      else await page.goto(p.path);
      await page.waitForLoadState("load");
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10_000 });
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("nextjs-portal").analyze();
        expect(results.violations.map((v) => `${theme}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")} ${v.nodes[0]?.failureSummary?.replace(/\s+/g, " ").slice(0, 160)}`)).toEqual([]);
      }
    });
    test(`${p.name}: no horizontal scroll at 360px`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      if (p.role) await signIn(page, p.role, p.path);
      else await page.goto(p.path);
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("shared dashboard: no axe violations and no overflow at 360px", async ({ page }) => {
    await page.goto("/");
    const href = await page.getByRole("link", { name: "See a shared dashboard" }).getAttribute("href");
    await page.goto(href!);
    await expect(page.locator("svg.recharts-surface").first()).toBeVisible();
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(results.violations.map((v) => `${theme}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    }
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
