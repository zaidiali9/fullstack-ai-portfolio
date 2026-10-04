import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, role: "admin" | "agent" | "customer") {
  await page.goto(`/sign-in?demo=${role}`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/o\/harbor-lane\/tickets/);
}

test.describe.configure({ mode: "serial" });

test("customer opens a ticket; agent sees AI triage (stub AI), drafts with AI (stub AI) and replies", async ({ browser }) => {
  // Customer submits a ticket.
  const customer = await (await browser.newContext()).newPage();
  await signIn(customer, "customer");
  await expect(customer.getByRole("heading", { name: "My requests" })).toBeVisible();
  await customer.getByRole("link", { name: "New ticket" }).first().click();
  await customer.getByLabel("Subject").fill("Invoice shows a duplicate charge");
  await customer.getByLabel("Describe the issue").fill("My invoice for March shows the same charge twice. Please refund the duplicate payment!");
  await customer.getByRole("button", { name: "Submit ticket" }).click();
  await customer.waitForURL(/\/tickets\/\d+\?created=1/);
  const number = customer.url().match(/tickets\/(\d+)/)![1];
  await expect(customer.getByRole("heading", { name: "Invoice shows a duplicate charge" })).toBeVisible();

  // Agent sees it in the queue with triage applied by the (stub) model.
  const agent = await (await browser.newContext()).newPage();
  await signIn(agent, "agent");
  await agent.goto(`/o/harbor-lane/tickets/${number}`);
  const triage = agent.locator("section[aria-labelledby=triage-heading]");
  await expect(async () => {
    await agent.reload();
    await expect(triage).toContainText("Billing", { timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await expect(triage).toContainText("[stub]");

  // Agent drafts a reply with AI (stub), edits it and sends it.
  await agent.getByRole("button", { name: "Draft with AI" }).click();
  await expect(agent.getByText("AI draft — review and edit")).toBeVisible();
  await expect(agent.locator("#reply-body")).toHaveValue(/\[stub\]/);
  await expect(agent.getByText("Articles given to the model")).toBeVisible();
  await agent.locator("#reply-body").fill("Hi Riley, the duplicate charge will be refunded within 3 business days. — Sam");
  await agent.getByRole("button", { name: "Send reply" }).click();
  await expect(agent.getByText("Reply sent")).toBeVisible();

  // Customer sees the agent's reply; the ticket is now pending.
  await customer.reload();
  await expect(customer.getByText("will be refunded within 3 business days")).toBeVisible();
  await expect(customer.getByText("Pending").first()).toBeVisible();
});

test("customer cannot reach agent-only pages or AI endpoints", async ({ page }) => {
  await signIn(page, "customer");
  const res = await page.goto("/o/harbor-lane/settings/members");
  expect(res?.status()).toBe(404);
  const api = await page.request.post("/api/orgs/harbor-lane/tickets/1/draft", { headers: { origin: new URL(page.url()).origin } });
  expect(api.status()).toBe(403);
  const csrf = await page.request.post("/api/orgs/harbor-lane/tickets/1/draft", { headers: { origin: "https://evil.example" } });
  expect(csrf.status()).toBe(403);
});

test("new user signs up and creates an organization", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.demo`;
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel("Organization name").fill("E2E Widgets");
  await expect(page.getByLabel("URL")).toHaveValue("e2e-widgets");
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.waitForURL(/\/o\/e2e-widgets\/tickets/);
  await expect(page.getByText("No tickets yet")).toBeVisible();
});

test("wrong password shows an error and does not sign in", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("agent@tidaldesk.demo");
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(page.url()).toContain("/sign-in");
});

test.describe("accessibility and responsive layout", () => {
  const pages = [
    { name: "landing", path: "/", role: null },
    { name: "sign-in", path: "/sign-in", role: null },
    { name: "tickets", path: "/o/harbor-lane/tickets", role: "agent" as const },
    { name: "ticket detail", path: "/o/harbor-lane/tickets/1", role: "agent" as const },
    { name: "knowledge base", path: "/o/harbor-lane/kb", role: "customer" as const },
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
