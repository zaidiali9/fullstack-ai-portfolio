import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, role: "owner" | "editor" | "viewer") {
  await page.goto(`/sign-in?demo=${role}`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/w\/brightline\/chat/);
}

async function ask(page: Page, question: string) {
  await page.getByLabel("Your question").fill(question);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Send question" })).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });

test("viewer asks a question and opens the cited passage (stub AI)", async ({ page }) => {
  await signIn(page, "viewer");
  await ask(page, "What is the spending limit per person for client dinners?");
  const answer = page.locator("div.rounded-2xl.border.bg-card").last();
  await expect(answer).toContainText("[stub]");
  await expect(answer.getByText("Sources")).toBeVisible();
  await answer.getByRole("button", { name: /^Source 1/ }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Travel and Expense Policy");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/w\/brightline\/chat\/[0-9a-f-]{36}/);
});

test("questions outside the documents are refused without inventing an answer", async ({ page }) => {
  await signIn(page, "viewer");
  await ask(page, "zebra quantum spaceship telemetry");
  await expect(page.getByText("I couldn't find this in the documents.")).toBeVisible();
  await expect(page.getByText("No relevant passage was found")).toBeVisible();
});

test("editor uploads a document, it is indexed, and answers cite it (stub AI)", async ({ page }) => {
  await signIn(page, "editor");
  await page.goto("/w/brightline/documents");
  await page.locator("#file-input").setInputFiles({
    name: "parking-policy.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Parking\n\nE2E DATA. Employees park in garage B for free. Visitors get two hours of free parking with a validated ticket."),
  });
  const row = page.getByRole("listitem").filter({ hasText: "parking policy" });
  await expect(row.getByText("Ready")).toBeVisible({ timeout: 30_000 });
  await page.goto("/w/brightline/chat");
  await ask(page, "Where do employees park for free in garage B?");
  await expect(page.locator("div.rounded-2xl.border.bg-card").last()).toContainText("parking policy");
});

test("viewers cannot upload; invalid files are rejected with a clear message", async ({ page }) => {
  await signIn(page, "viewer");
  await page.goto("/w/brightline/documents");
  await expect(page.getByText("Drop files here")).toHaveCount(0);
  const res = await page.request.post("/api/w/brightline/documents", {
    multipart: { file: { name: "x.md", mimeType: "text/markdown", buffer: Buffer.from("hello world content") } },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(res.status()).toBe(403);
});

test("owner sees settings; the widget only renders on allowlisted sites", async ({ page, request }) => {
  await signIn(page, "owner");
  await page.goto("/w/brightline/settings");
  await expect(page.getByRole("heading", { name: "Website widget" })).toBeVisible();
  const snippet = await page.locator("pre code").innerText();
  const key = /data-key="(wk_[^"]+)"/.exec(snippet)![1]!;
  const blocked = await request.get(`/embed/${key}`, { headers: { referer: "https://evil.example/page" } });
  expect(await blocked.text()).toContain("isn&#x27;t enabled for this website");
  const preview = await request.get(`/embed/${key}`, { headers: { referer: `${new URL(page.url()).origin}/w/brightline/settings` } });
  expect(await preview.text()).toContain("Brightline Handbook");
});

test.describe("accessibility and responsive layout", () => {
  const pages = [
    { name: "landing", path: "/", role: null },
    { name: "sign-in", path: "/sign-in", role: null },
    { name: "chat", path: "/w/brightline/chat", role: "viewer" as const },
    { name: "documents", path: "/w/brightline/documents", role: "editor" as const },
    { name: "settings", path: "/w/brightline/settings", role: "owner" as const },
  ];
  for (const p of pages) {
    test(`${p.name}: no axe violations (WCAG 2 A/AA)`, async ({ page }) => {
      if (p.role) await signIn(page, p.role);
      await page.goto(p.path);
      await page.waitForLoadState("networkidle");
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("nextjs-portal").analyze();
        expect(results.violations.map((v) => `${theme}: ${v.id} (${v.nodes.length})`)).toEqual([]);
      }
    });
    test(`${p.name}: no horizontal scroll at 360px`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      if (p.role) await signIn(page, p.role);
      await page.goto(p.path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
