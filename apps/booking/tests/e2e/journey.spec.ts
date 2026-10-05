import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

type Role = "owner" | "staff" | "customer";
const DEMO_BUTTON: Record<Role, string> = { owner: "Owner (Dana)", staff: "Staff (Sam)", customer: "Customer (Jamie)" };

async function signIn(page: Page, role: Role, next = "/app") {
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

/** Open the deep tissue page with Sam selected and wait for the slot grid. */
async function openSamSlots(page: Page) {
  await page.goto("/book/deep-tissue-massage");
  await page.getByRole("radio", { name: "Sam Rivera" }).click();
  await expect(page.locator("[data-slot-start]").first()).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("guest picks a time, signs in, holds and confirms a booking", async ({ page }) => {
  await openSamSlots(page);
  const slot = page.locator("[data-slot-start]").first();
  const start = await slot.getAttribute("data-slot-start");
  await slot.click();
  await page.waitForURL(/\/sign-in/);
  await page.getByRole("link", { name: DEMO_BUTTON.customer }).click();
  await expect(page.locator("#email")).toHaveValue("customer@bookwell.demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/book\/deep-tissue-massage\?/);
  // The time picked before signing in is highlighted.
  const suggested = page.locator(`[data-slot-start="${start}"]`);
  await expect(suggested).toHaveAttribute("aria-label", /suggested/);
  await suggested.click();
  await page.waitForURL(/\/book\/confirm\//);
  await expect(page.getByRole("heading", { name: "Confirm your booking" })).toBeVisible();
  await expect(page.getByRole("timer")).toContainText("Held for you");
  await page.getByLabel("Anything we should know? (optional)").fill("Left shoulder is tight");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await page.waitForURL(/\/my\/.+\?booked=1/);
  await expect(page.getByText("You're booked!")).toBeVisible();
  await expect(page.getByText("Left shoulder is tight")).toBeVisible();
  await page.goto("/my");
  await expect(page.getByRole("heading", { name: "My bookings" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Deep tissue massage/ }).first()).toBeVisible();
});

test("live availability: a hold in one browser removes the slot from another", async ({ browser }) => {
  const watcher = await browser.newPage();
  await openSamSlots(watcher);
  await expect(watcher.getByRole("status").filter({ hasText: "Live" })).toBeVisible();
  const start = await watcher.locator("[data-slot-start]").nth(2).getAttribute("data-slot-start");

  const { ctx, page } = await asUser(browser, "owner", "/book/deep-tissue-massage");
  await page.getByRole("radio", { name: "Sam Rivera" }).click();
  await page.locator(`[data-slot-start="${start}"]`).click();
  await page.waitForURL(/\/book\/confirm\//);
  // Pushed over SSE: no reload in the watcher's tab.
  await expect(watcher.locator(`[data-slot-start="${start}"]`)).toHaveCount(0, { timeout: 10_000 });
  await ctx.close();
  await watcher.close();
});

test("a stale tab that loses the race gets a clear conflict with alternatives", async ({ browser }) => {
  const late = await asUser(browser, "customer", "/book/deep-tissue-massage");
  // Simulate a tab with no live updates (e.g. a dropped connection).
  await late.page.route("**/api/stream", (r) => r.abort());
  await late.page.reload();
  await late.page.getByRole("radio", { name: "Sam Rivera" }).click();
  const start = await late.page.locator("[data-slot-start]").nth(6).getAttribute("data-slot-start");

  const first = await asUser(browser, "staff", "/book/deep-tissue-massage");
  await first.page.getByRole("radio", { name: "Sam Rivera" }).click();
  await first.page.locator(`[data-slot-start="${start}"]`).click();
  await first.page.waitForURL(/\/book\/confirm\//);

  await late.page.locator(`[data-slot-start="${start}"]`).click();
  const alert = late.page.getByRole("alert").filter({ hasText: "just taken" });
  await expect(alert).toBeVisible();
  const alternative = alert.getByRole("button").first();
  await expect(alternative).toContainText("with Sam");
  await alternative.click();
  await late.page.waitForURL(/\/book\/confirm\//);
  await first.ctx.close();
  await late.ctx.close();
});

test("customer reschedules, then cancels", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await signIn(page, "customer", "/my");
  await page.getByRole("link", { name: /Deep tissue massage/ }).first().click();
  await page.getByRole("link", { name: "Reschedule" }).click();
  await expect(page.getByRole("heading", { name: /Reschedule Deep tissue massage/ })).toBeVisible();
  const bookingPath = new URL(page.url()).pathname.replace("/reschedule", "");
  // Move to the next day that has open times.
  await page.getByRole("option", { selected: false }).and(page.locator(":not([disabled])")).first().click();
  await page.locator("[data-slot-start]").last().click();
  await page.waitForURL((u) => u.pathname === bookingPath && u.search === "?rescheduled=1");
  await expect(page.getByText("Your booking was moved")).toBeVisible();
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText("Booking cancelled.")).toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
});

test("team calendar updates live when a customer books, and shows a toast", async ({ browser }) => {
  const staff = await asUser(browser, "staff", "/dashboard");
  const customer = await asUser(browser, "customer", "/book/deep-tissue-massage");
  await customer.page.getByRole("radio", { name: "Sam Rivera" }).click();
  const slot = customer.page.locator("[data-slot-start]").first();
  const start = (await slot.getAttribute("data-slot-start"))!;
  await slot.click();
  await customer.page.waitForURL(/\/book\/confirm\//);

  // Open the staff calendar on the booked day (studio time zone).
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(start));
  await staff.page.goto(`/dashboard?date=${date}`);
  await expect(staff.page.getByRole("status").filter({ hasText: "Live" })).toBeVisible();
  const blocks = staff.page.locator('a[href^="/dashboard/bookings/"]');
  const n = await blocks.count();
  await customer.page.getByRole("button", { name: "Confirm booking" }).click();
  await customer.page.waitForURL(/\?booked=1/);
  await expect(staff.page.getByText(/New booking: BK-/)).toBeVisible({ timeout: 10_000 });
  await expect(blocks).toHaveCount(n, { timeout: 10_000 }); // held block became confirmed (same count)
  await expect(staff.page.locator('a[aria-label*="Jamie Lee, Confirmed"]').first()).toBeVisible();
  await staff.ctx.close();
  await customer.ctx.close();
});

test("NL assistant turns a request into real open times (stub AI)", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe what you'd like").fill("Deep tissue massage with Sam next week in the morning");
  await page.getByRole("button", { name: "Find times" }).click();
  await expect(page.getByText("Understood:")).toBeVisible();
  await expect(page.getByText("Deep tissue massage", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("with Sam", { exact: true })).toBeVisible();
  await expect(page.getByText(/Interpreted by AI \(stub · stub-model\)/)).toBeVisible();
  const option = page.getByRole("link", { name: /AM\s*with Sam Rivera/ }).first();
  await expect(option).toBeVisible();
  await option.click();
  await page.waitForURL(/\/book\/deep-tissue-massage\?staff=.+&time=/);
  await expect(page.locator('[data-slot-start][aria-label*="suggested"]')).toBeVisible();
});

test("owner digest streams a labelled AI summary (stub AI); staff and customers are kept out", async ({ browser }) => {
  const owner = await asUser(browser, "owner", "/dashboard/digest");
  await expect(owner.page.getByRole("heading", { name: "Weekly digest" })).toBeVisible();
  await owner.page.getByRole("button", { name: "Write this week's digest" }).click();
  await expect(owner.page.getByText("[stub] Weekly digest placeholder")).toBeVisible();
  await expect(owner.page.getByText("AI-generated by stub · stub-model.")).toBeVisible();
  await owner.ctx.close();

  const staff = await asUser(browser, "staff", "/dashboard");
  expect((await staff.page.goto("/dashboard/digest"))?.status()).toBe(404);
  await staff.ctx.close();

  const customer = await asUser(browser, "customer", "/my");
  expect((await customer.page.goto("/dashboard"))?.status()).toBe(404);
  const res = await customer.page.request.post("/api/digest", { headers: { origin: new URL(customer.page.url()).origin } });
  expect(res.status()).toBe(403);
  await customer.ctx.close();
});

test("API guards: auth, validation and cross-origin", async ({ request, baseURL }) => {
  expect((await request.get("/api/stream/team")).status()).toBe(401);
  const bad = await request.get("/api/availability?service=not-a-uuid");
  expect(bad.status()).toBe(400);
  expect(JSON.stringify(await bad.json())).not.toContain("stack");
  expect((await request.post("/api/assistant", { data: { request: "massage" }, headers: { origin: "https://evil.example" } })).status()).toBe(403);
  const tooLong = await request.post("/api/assistant", { data: { request: "x".repeat(301) }, headers: { origin: baseURL! } });
  expect(tooLong.status()).toBe(400);
  const health = await (await request.get("/api/health")).json();
  expect(health).toMatchObject({ status: "ok", database: "ok" });
});

test.describe("accessibility and responsive layout", () => {
  // Independent checks: one failure shouldn't skip the rest.
  test.describe.configure({ mode: "default" });
  const pages = [
    { name: "home", path: "/", role: null },
    { name: "booking", path: "/book/signature-facial", role: null },
    { name: "my bookings", path: "/my", role: "customer" as const },
    { name: "team calendar", path: "/dashboard", role: "owner" as const },
    { name: "digest", path: "/dashboard/digest", role: "owner" as const },
  ];
  for (const p of pages) {
    test(`${p.name}: no axe violations (WCAG 2 A/AA)`, async ({ page }) => {
      if (p.role) await signIn(page, p.role, p.path);
      else await page.goto(p.path);
      await page.waitForLoadState("load");
      await page.waitForTimeout(800);
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("nextjs-portal").analyze();
        expect(results.violations.map((v) => `${theme}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")} ${v.nodes[0]?.failureSummary?.replace(/\s+/g, " ").slice(0, 200)}`)).toEqual([]);
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
});
