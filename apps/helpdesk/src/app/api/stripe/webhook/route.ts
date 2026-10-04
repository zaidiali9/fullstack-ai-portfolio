import { db } from "@/db";
import { env } from "@/lib/env";
import { applyStripeEvent, getStripe } from "@/server/billing";

/**
 * Stripe webhook. The signature is verified against the raw body with STRIPE_WEBHOOK_SECRET;
 * unsigned or tampered requests get 400 and change nothing.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return Response.json({ error: { code: "payments_not_configured", message: "Payments are not configured." } }, { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: { code: "missing_signature", message: "Missing Stripe signature." } }, { status: 400 });
  const body = await req.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, secret);
  } catch {
    return Response.json({ error: { code: "invalid_signature", message: "Invalid Stripe signature." } }, { status: 400 });
  }
  try {
    const applied = await applyStripeEvent(db, event);
    return Response.json({ received: true, duplicate: !applied });
  } catch (err) {
    console.error("[stripe] webhook processing failed", err);
    // 500 makes Stripe retry later.
    return Response.json({ error: { code: "processing_failed", message: "Webhook processing failed." } }, { status: 500 });
  }
}
