import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/stripe/webhook/route";
import { db, schema } from "@/db";
import { applyStripeEvent } from "@/server/billing";
import { makeOrg } from "./factories";

const stripe = new Stripe("sk_test_unit_dummy");
const SECRET = "whsec_unit_test_secret"; // matches vitest.config env

function event(type: string, object: Record<string, unknown>, id = `evt_${Math.random().toString(36).slice(2)}`) {
  return { id, object: "event", type, data: { object }, api_version: "2025-01-01", created: 0, livemode: false, pending_webhooks: 0, request: null } as unknown as Stripe.Event;
}

async function signedRequest(payload: unknown, secret = SECRET) {
  const body = JSON.stringify(payload);
  const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload: body, secret });
  return new Request("http://localhost/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": header } });
}

describe("Stripe webhook (test mode, signed locally)", () => {
  it("upgrades the org on checkout.session.completed and is idempotent", async () => {
    const org = await makeOrg();
    const e = event("checkout.session.completed", { mode: "subscription", metadata: { orgId: org.id }, subscription: "sub_123", customer: "cus_123" });
    expect(await applyStripeEvent(db, e)).toBe(true);
    expect(await applyStripeEvent(db, e)).toBe(false); // duplicate delivery ignored
    const [o] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, org.id));
    expect(o).toMatchObject({ plan: "pro", stripeSubscriptionId: "sub_123", stripeCustomerId: "cus_123", subscriptionStatus: "active" });
    const audits = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.orgId, org.id));
    expect(audits.filter((a) => a.action === "billing.subscribed")).toHaveLength(1);
  });

  it("downgrades on subscription deletion", async () => {
    const org = await makeOrg(undefined, "pro");
    await db.update(schema.organizations).set({ stripeSubscriptionId: "sub_del" }).where(eq(schema.organizations.id, org.id));
    await applyStripeEvent(db, event("customer.subscription.deleted", { id: "sub_del", status: "canceled", metadata: {}, items: { data: [] } }));
    const [o] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, org.id));
    expect(o).toMatchObject({ plan: "free", subscriptionStatus: "canceled" });
  });

  it("route accepts a correctly signed event", async () => {
    const org = await makeOrg();
    const res = await POST(await signedRequest(event("checkout.session.completed", { mode: "subscription", metadata: { orgId: org.id }, subscription: "sub_route", customer: "cus_route" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: false });
    const [o] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, org.id));
    expect(o!.plan).toBe("pro");
  });

  it("route rejects missing or forged signatures without changing data", async () => {
    const org = await makeOrg();
    const payload = event("checkout.session.completed", { mode: "subscription", metadata: { orgId: org.id }, subscription: "sub_x" });
    const noSig = await POST(new Request("http://localhost/x", { method: "POST", body: JSON.stringify(payload) }));
    expect(noSig.status).toBe(400);
    const forged = await POST(await signedRequest(payload, "whsec_attacker"));
    expect(forged.status).toBe(400);
    const [o] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, org.id));
    expect(o!.plan).toBe("free");
  });
});
