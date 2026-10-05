import { expect, test, type Page } from "@playwright/test";

// README screenshots from a RUNNING app with real AI providers (see playwright.screenshots.config.ts).
const OUT = "docs/screenshots";

async function signIn(page: Page, role: "admin" | "customer", next: string) {
  await page.goto(`/sign-in?demo=${role}&next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === next);
}

test("capture README screenshots (real AI provider)", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: "light" })).newPage();
  await page.goto("/");
  await page.screenshot({ path: `${OUT}/home.png` });
  await page.goto("/products?q=something+to+keep+coffee+hot+on+a+hike");
  await page.screenshot({ path: `${OUT}/semantic-search.png` });
  await page.goto("/products/ridgeline-camping-lantern");
  await page.screenshot({ path: `${OUT}/product.png`, fullPage: true });
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText(/Added to cart/)).toBeVisible();

  const admin = await (await browser.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: "dark" })).newPage();
  await signIn(admin, "admin", "/admin/products/new");
  await admin.getByLabel("Name", { exact: true }).fill("Beeswax Food Wraps");
  await admin.getByLabel(/^Facts/).fill("Pieces: 3 wraps (S, M, L)\nMaterial: Organic cotton coated in beeswax\nCare: Rinse in cool water and air dry");
  // Real model: retry once if the draft fails validation.
  for (let attempt = 0; attempt < 2; attempt++) {
    await admin.getByRole("button", { name: "Draft with AI" }).click();
    const done = await admin
      .getByText("AI draft ready")
      .waitFor({ timeout: 240_000 })
      .then(() => true)
      .catch(() => false);
    if (done) break;
  }
  await admin.waitForTimeout(800);
  await admin.screenshot({ path: `${OUT}/admin-ai-draft-dark.png`, fullPage: true });

  const mobile = await (await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })).newPage();
  await mobile.goto("/products/ridgeline-camping-lantern");
  await mobile.screenshot({ path: `${OUT}/product-mobile.png` });
});
