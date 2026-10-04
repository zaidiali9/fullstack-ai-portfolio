import { expect, test, type Page } from "@playwright/test";

const OUT = "docs/screenshots";

async function signIn(page: Page, role: "agent" | "customer" | "admin") {
  await page.goto(`/sign-in?demo=${role}`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/tickets/);
}

test("capture README screenshots (real AI provider)", async ({ browser }) => {
  const desktop = await browser.newContext({ viewport: { width: 1360, height: 860 }, colorScheme: "light", deviceScaleFactor: 1 });
  const page = await desktop.newPage();
  await page.goto("/");
  await page.screenshot({ path: `${OUT}/landing.png` });

  await signIn(page, "agent");
  await page.waitForTimeout(1500); // let the welcome toast fade
  await page.screenshot({ path: `${OUT}/agent-queue.png` });

  await page.goto("/o/harbor-lane/tickets?status=all");
  await page.getByRole("link", { name: "Can't sign in after changing phones" }).first().click();
  await page.getByRole("button", { name: "Draft with AI" }).click();
  await expect(page.getByText("AI draft — review and edit")).toBeVisible({ timeout: 240_000 });
  await page.getByRole("button", { name: "Summarize" }).click();
  await expect(page.locator("section[aria-labelledby=summary-heading] .whitespace-pre-wrap")).toBeVisible({ timeout: 240_000 });
  await expect(page.locator("section[aria-labelledby=summary-heading]").getByRole("button", { name: "Refresh" })).toBeEnabled({ timeout: 240_000 });
  await page.screenshot({ path: `${OUT}/ticket-ai-draft.png`, fullPage: true });

  await page.goto("/o/harbor-lane/settings/usage");
  await page.screenshot({ path: `${OUT}/ai-usage.png` });

  const dark = await browser.newContext({ viewport: { width: 1360, height: 860 }, colorScheme: "dark" });
  const darkPage = await dark.newPage();
  await signIn(darkPage, "admin");
  await darkPage.goto("/o/harbor-lane/kb");
  await darkPage.waitForTimeout(1500);
  await darkPage.screenshot({ path: `${OUT}/knowledge-base-dark.png` });

  const mobile = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: "light", isMobile: true, hasTouch: true });
  const phone = await mobile.newPage();
  await signIn(phone, "customer");
  await phone.waitForTimeout(1500);
  await phone.screenshot({ path: `${OUT}/customer-mobile.png` });
});
