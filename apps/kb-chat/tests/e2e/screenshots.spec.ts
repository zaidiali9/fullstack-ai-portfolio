import { expect, test, type Page } from "@playwright/test";

// README screenshots from a RUNNING app with a real AI provider (see playwright.screenshots.config.ts).
const OUT = "docs/screenshots";

async function signIn(page: Page, role: "owner" | "editor" | "viewer") {
  await page.goto(`/sign-in?demo=${role}`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/w\//);
}

test("capture README screenshots (real AI provider)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, colorScheme: "light" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.screenshot({ path: `${OUT}/landing.png` });

  await signIn(page, "viewer");
  await page.waitForTimeout(1500);
  await page.getByLabel("Your question").fill("What is the spending limit per person for client dinners?");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Send question" })).toBeVisible({ timeout: 240_000 });
  await page.getByLabel("Your question").fill("Does Brightline pay for a gym membership?");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Send question" })).toBeVisible({ timeout: 240_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/chat-citations.png` });
  await page.getByRole("button", { name: /^Source 1/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/citation-passage.png` });

  const owner = await (await browser.newContext({ viewport: { width: 1360, height: 860 }, colorScheme: "dark" })).newPage();
  await signIn(owner, "owner");
  await owner.goto("/w/brightline/documents");
  await owner.waitForTimeout(1500);
  await owner.screenshot({ path: `${OUT}/documents-dark.png` });
  await owner.goto("/w/brightline/settings");
  await owner.getByRole("heading", { name: "Website widget" }).scrollIntoViewIfNeeded();
  await owner.screenshot({ path: `${OUT}/settings-widget-dark.png` });

  const mobile = await (await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })).newPage();
  await signIn(mobile, "viewer");
  await mobile.waitForTimeout(1500);
  await mobile.screenshot({ path: `${OUT}/chat-mobile.png` });
});
