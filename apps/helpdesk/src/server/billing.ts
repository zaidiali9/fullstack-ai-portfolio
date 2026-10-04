import "server-only";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { HttpError } from "@portfolio/kit";
import { db, schema, type DB } from "@/db";
import { env } from "@/lib/env";
import { audit } from "./audit";
import type { OrgContext } from "./authz";

let stripe: Stripe | null | undefined;

/** Stripe client, or null when not configured. Live keys are refused: this portfolio runs in TEST MODE only. */
export function getStripe(): Stripe | null {
  if (stripe !== undefined) return stripe;
  const key = env().STRIPE_SECRET_KEY;
  if (!key) return (stripe = null);
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    console.error("[billing] Refusing a non-test Stripe key. Use test-mode keys (sk_test_...).");
    return (stripe = null);
  }
  return (stripe = new Stripe(key));
}

export function billingConfigured() {
  return !!getStripe() && !!env().STRIPE_PRICE_PRO;
}

const notConfigured = () =>
  new HttpError(503, "payments_not_configured", "Payments are not configured on this server (Stripe test-mode keys are required).");

export async function createCheckoutSession(ctx: OrgContext): Promise<string> {
  const s = getStripe();
  const price = env().STRIPE_PRICE_PRO;
  if (!s || !price) throw notConfigured();
  if (ctx.org.plan === "pro" && ctx.org.subscriptionStatus === "active") throw new HttpError(400, "already_pro", "This organization is already on Pro.");
  let customerId = ctx.org.stripeCustomerId;
  if (!customerId) {
    const customer = await s.customers.create({ name: ctx.org.name, email: ctx.user.email, metadata: { orgId: ctx.org.id } });
    customerId = customer.id;
    await db.update(schema.organizations).set({ stripeCustomerId: customerId }).where(eq(schema.organizations.id, ctx.org.id));
  }
  const base = `${env().APP_URL}/o/${ctx.org.slug}/settings/billing`;
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: ctx.org.id,
    metadata: { orgId: ctx.org.id },
    subscription_data: { metadata: { orgId: ctx.org.id } },
    success_url: `${base}?checkout=success`,
    cancel_url: `${base}?checkout=cancelled`,
  });
  if (!session.url) throw new HttpError(502, "stripe_error", "Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalSession(ctx: OrgContext): Promise<string> {
  const s = getStripe();
  if (!s) throw notConfigured();
  if (!ctx.org.stripeCustomerId) throw new HttpError(400, "no_customer", "This organization has no billing account yet.");
  const portal = await s.billingPortal.sessions.create({ customer: ctx.org.stripeCustomerId, return_url: `${env().APP_URL}/o/${ctx.org.slug}/settings/billing` });
  return portal.url;
}

const ACTIVE = new Set(["active", "trialing", "past_due"]);

/**
 * Apply a verified Stripe event. Idempotent: each event id is recorded once in stripe_events,
 * in the same transaction as the change it causes. Returns false for duplicates.
 */
export async function applyStripeEvent(database: DB, event: Stripe.Event): Promise<boolean> {
  return database.transaction(async (tx) => {
    const inserted = await tx.insert(schema.stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning();
    if (inserted.length === 0) return false;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.orgId ?? session.client_reference_id;
      if (!orgId || session.mode !== "subscription") return true;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      await tx
        .update(schema.organizations)
        .set({ plan: "pro", subscriptionStatus: "active", stripeSubscriptionId: subscriptionId ?? null, stripeCustomerId: customerId ?? null })
        .where(eq(schema.organizations.id, orgId));
      await audit(tx, { orgId, actorId: null, action: "billing.subscribed", targetType: "organization", targetId: orgId, meta: { plan: "pro", stripeEvent: event.id } });
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const [org] = await tx
        .select({ id: schema.organizations.id })
        .from(schema.organizations)
        .where(eq(schema.organizations.stripeSubscriptionId, sub.id))
        .limit(1);
      const orgId = org?.id ?? sub.metadata?.orgId;
      if (!orgId) return true;
      const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
      const periodEnd = sub.items?.data?.[0]?.current_period_end;
      await tx
        .update(schema.organizations)
        .set({
          plan: ACTIVE.has(status) ? "pro" : "free",
          subscriptionStatus: status,
          stripeSubscriptionId: sub.id,
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
        })
        .where(eq(schema.organizations.id, orgId));
      await audit(tx, { orgId, actorId: null, action: "billing.subscription_changed", targetType: "organization", targetId: orgId, meta: { status, stripeEvent: event.id } });
    }
    return true;
  });
}
