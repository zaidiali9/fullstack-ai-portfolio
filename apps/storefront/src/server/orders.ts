import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { HttpError, notFound as notFoundError, paginate } from "@portfolio/kit";
import { db, schema, type DB } from "@/db";
import { env } from "@/lib/env";
import type { StoreUser } from "./access";
import { loadCart } from "./cart";

let stripe: Stripe | null | undefined;

/** Stripe client or null. Live keys are refused: this portfolio runs in TEST MODE only. */
export function getStripe(): Stripe | null {
  if (stripe !== undefined) return stripe;
  const key = env().STRIPE_SECRET_KEY;
  if (!key) return (stripe = null);
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    console.error("[stripe] Refusing a non-test key. Use test-mode keys (sk_test_...).");
    return (stripe = null);
  }
  return (stripe = new Stripe(key));
}

/**
 * Create a pending order from the cart (prices and stock re-checked on the server) and a Stripe
 * Checkout Session for it. The order only becomes "paid" when the signed webhook arrives.
 */
export async function startCheckout(user: StoreUser, cartId: string | null): Promise<string> {
  const s = getStripe();
  if (!s) throw new HttpError(503, "payments_not_configured", "Payments are not configured on this server (Stripe test-mode keys are required).");
  const cart = await loadCart(cartId);
  if (!cart.lines.length) throw new HttpError(400, "empty_cart", "Your cart is empty.");
  if (cart.problems.length) throw new HttpError(409, "cart_problem", cart.problems[0]!);

  // Create the Stripe session first (with a pre-generated order id), then store the order and its
  // items in one transaction: a Stripe failure leaves no orphaned pending order behind.
  const order = { id: randomUUID() };
  const session = await s.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    client_reference_id: order.id,
    metadata: { orderId: order.id },
    payment_intent_data: { metadata: { orderId: order.id } },
    shipping_address_collection: { allowed_countries: ["US", "CA"] },
    line_items: [
      ...cart.lines.map((l) => ({ quantity: l.quantity, price_data: { currency: "usd", unit_amount: l.unitPriceCents, product_data: { name: l.name } } })),
      ...(cart.shippingCents ? [{ quantity: 1, price_data: { currency: "usd", unit_amount: cart.shippingCents, product_data: { name: "Shipping" } } }] : []),
    ],
    success_url: `${env().APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env().APP_URL}/cart?checkout=cancelled`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
  });
  if (!session.url) throw new HttpError(502, "stripe_error", "Stripe did not return a checkout URL.");
  await db.transaction(async (tx) => {
    await tx.insert(schema.orders).values({
      id: order.id,
      userId: user.id,
      email: user.email,
      subtotalCents: cart.subtotalCents,
      shippingCents: cart.shippingCents,
      totalCents: cart.totalCents,
      stripeSessionId: session.id,
    });
    await tx.insert(schema.orderItems).values(cart.lines.map((l) => ({ orderId: order.id, productId: l.productId, name: l.name, unitPriceCents: l.unitPriceCents, quantity: l.quantity })));
  });
  return session.url;
}

/**
 * Apply a verified Stripe event. Idempotent (event ids recorded in the same transaction). On payment,
 * stock is decremented with a guarded UPDATE so it can never go negative, and the buyer's cart is emptied.
 */
export async function applyStripeEvent(database: DB, event: Stripe.Event): Promise<boolean> {
  return database.transaction(async (tx) => {
    const fresh = await tx.insert(schema.stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning();
    if (!fresh.length) return false;

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid") return true;
      const orderId = session.metadata?.orderId ?? session.client_reference_id;
      if (!orderId) return true;
      const [order] = await tx
        .update(schema.orders)
        .set({
          status: "paid",
          paidAt: new Date(),
          stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
          shippingName: session.collected_information?.shipping_details?.name ?? null,
          shippingAddress: (session.collected_information?.shipping_details?.address as unknown as Record<string, string | null>) ?? null,
        })
        .where(and(eq(schema.orders.id, orderId), eq(schema.orders.status, "pending")))
        .returning();
      if (!order) return true; // already handled or cancelled
      const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
      for (const it of items) {
        if (!it.productId) continue;
        await tx.execute(sql`update products set stock = greatest(stock - ${it.quantity}, 0), updated_at = now() where id = ${it.productId}`);
      }
      // Empty the buyer's carts of the purchased products.
      const productIds = items.map((i) => i.productId).filter((x): x is string => !!x);
      if (productIds.length) {
        await tx.execute(sql`delete from cart_items where product_id in (${sql.join(productIds.map((p) => sql`${p}`), sql`, `)})
          and cart_id in (select id from carts where user_id = ${order.userId})`);
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId ?? session.client_reference_id;
      if (orderId) await tx.update(schema.orders).set({ status: "cancelled" }).where(and(eq(schema.orders.id, orderId), eq(schema.orders.status, "pending")));
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (pi && charge.refunded) await tx.update(schema.orders).set({ status: "refunded" }).where(eq(schema.orders.stripePaymentIntentId, pi));
    }
    return true;
  });
}

export async function listMyOrders(userId: string) {
  return db
    .select({ id: schema.orders.id, number: schema.orders.number, status: schema.orders.status, totalCents: schema.orders.totalCents, createdAt: schema.orders.createdAt })
    .from(schema.orders)
    .where(and(eq(schema.orders.userId, userId), sql`${schema.orders.status} <> 'pending' or ${schema.orders.createdAt} > now() - interval '1 hour'`))
    .orderBy(desc(schema.orders.createdAt))
    .limit(100);
}

/** One order with its items; customers can only read their own, admins any. */
export async function getOrder(user: StoreUser, orderId: string) {
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.id, orderId), user.role === "admin" ? undefined : eq(schema.orders.userId, user.id)))
    .limit(1);
  if (!order) throw notFoundError("Order");
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
  return { order, items };
}

export async function getOrderBySession(user: StoreUser, sessionId: string) {
  const [order] = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(and(eq(schema.orders.stripeSessionId, sessionId), eq(schema.orders.userId, user.id)))
    .limit(1);
  return order ? getOrder(user, order.id) : null;
}

export const adminOrdersQuery = z.object({
  status: z.enum(["all", ...schema.orderStatus.enumValues]).default("all"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export async function listAllOrders(q: z.infer<typeof adminOrdersQuery>) {
  const where = q.status === "all" ? undefined : eq(schema.orders.status, q.status);
  const size = 20;
  const [items, [total]] = await Promise.all([
    db
      .select({ id: schema.orders.id, number: schema.orders.number, email: schema.orders.email, status: schema.orders.status, totalCents: schema.orders.totalCents, createdAt: schema.orders.createdAt })
      .from(schema.orders)
      .where(where)
      .orderBy(desc(schema.orders.createdAt))
      .limit(size)
      .offset((q.page - 1) * size),
    db.select({ n: count() }).from(schema.orders).where(where),
  ]);
  return paginate(items, total?.n ?? 0, q.page, size);
}

const TRANSITIONS: Record<string, string[]> = { paid: ["fulfilled"], fulfilled: [], pending: ["cancelled"], cancelled: [], refunded: [] };

export async function setOrderStatus(orderId: string, status: "fulfilled" | "cancelled") {
  const [o] = await db.select({ status: schema.orders.status }).from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
  if (!o) throw notFoundError("Order");
  if (!TRANSITIONS[o.status]?.includes(status)) throw new HttpError(409, "invalid_transition", `A ${o.status} order can't be marked ${status}.`);
  await db.update(schema.orders).set({ status }).where(and(eq(schema.orders.id, orderId), inArray(schema.orders.status, [o.status])));
}
