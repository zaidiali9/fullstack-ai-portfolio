import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, role: "admin" | "customer", next = "/") {
  await page.goto(`/sign-in?demo=${role}&next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === next);
}

test.describe.configure({ mode: "serial" });

test("guest searches, adds to cart, signs in and keeps the cart (stub embeddings)", async ({ page }) => {
  await page.goto("/");
  await page.locator("#site-search").fill("lantern for the tent");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Results for/ })).toBeVisible();
  await expect(page.getByText("Semantic search")).toBeVisible();
  await page.getByRole("link", { name: /Ridgeline Camping Lantern/ }).first().click();
  await expect(page.getByRole("heading", { name: "Ridgeline Camping Lantern" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Similar items" })).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText(/Added to cart/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Cart, 1 item" })).toBeVisible();

  await page.goto("/cart");
  await page.getByRole("link", { name: "Sign in to check out" }).click();
  await page.getByRole("link", { name: "Customer (Alex)" }).click();
  await expect(page.locator("#email")).toHaveValue("customer@fernwood.demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/cart$/);
  await expect(page.getByRole("link", { name: "Ridgeline Camping Lantern" })).toBeVisible();
  // No Stripe keys in the E2E environment: checkout is honestly disabled.
  await expect(page.getByText("Payments are not configured on this server")).toBeVisible();
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await expect(page.getByText("$76.00")).toBeVisible(); // 2 × $38, free shipping over $75
});

test("customer sees order history (seed data) and cannot open the admin", async ({ page }) => {
  await signIn(page, "customer", "/account/orders");
  await expect(page.getByText("Order #1001")).toBeVisible();
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404);
});

test("admin drafts a description with AI (stub AI), edits it and publishes a product", async ({ page }) => {
  await signIn(page, "admin", "/admin");
  await page.getByRole("link", { name: "New product" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Beeswax Food Wraps");
  await page.getByLabel(/^Facts/).fill("Pieces: 3 wraps\nMaterial: Organic cotton and beeswax");
  await page.getByRole("button", { name: "Draft with AI" }).click();
  await expect(page.locator("#description")).toHaveValue(/\[stub\]/);
  await page.locator("#description").fill("Three reusable wraps in organic cotton and beeswax to cover bowls and wrap bread. Rinse in cool water and reuse.");
  await page.getByLabel("Price (USD)").fill("19");
  await page.getByLabel("Stock").fill("10");
  await page.getByRole("button", { name: "Save product" }).click();
  await page.waitForURL(/\/admin\?saved=beeswax-food-wraps/);
  await page.goto("/products/beeswax-food-wraps");
  await expect(page.getByRole("heading", { name: "Beeswax Food Wraps" })).toBeVisible();
  await expect(page.getByText("$19.00")).toBeVisible();
});

test("SEO basics: sitemap, robots and Product structured data", async ({ page, request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/products/ridgeline-camping-lantern");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
  await page.goto("/products/ridgeline-camping-lantern");
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld).toMatchObject({ "@type": "Product", offers: { priceCurrency: "USD", price: "38.00" } });
  await expect(page).toHaveTitle(/Ridgeline Camping Lantern/);
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toContain("/products/ridgeline-camping-lantern");
});

test.describe("accessibility and responsive layout", () => {
  const pages = [
    { name: "home", path: "/", role: null },
    { name: "catalog", path: "/products", role: null },
    { name: "product", path: "/products/ridgeline-camping-lantern", role: null },
    { name: "cart", path: "/cart", role: "customer" as const },
    { name: "admin", path: "/admin", role: "admin" as const },
  ];
  for (const p of pages) {
    test(`${p.name}: no axe violations (WCAG 2 A/AA)`, async ({ page }) => {
      if (p.role) await signIn(page, p.role, p.path);
      else await page.goto(p.path);
      await page.waitForLoadState("networkidle");
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("nextjs-portal").analyze();
        expect(results.violations.map((v) => `${theme}: ${v.id} (${v.nodes.length})`)).toEqual([]);
      }
    });
    test(`${p.name}: no horizontal scroll at 360px`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      if (p.role) await signIn(page, p.role, p.path);
      else await page.goto(p.path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
