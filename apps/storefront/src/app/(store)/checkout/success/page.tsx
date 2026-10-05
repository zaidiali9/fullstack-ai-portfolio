import { CheckCircle2, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { OrderStatus, OrderSummary } from "@/components/store/order-summary";
import { requireCustomer } from "@/server/access";
import { getOrderBySession } from "@/server/orders";

export const metadata: Metadata = { title: "Order received", robots: { index: false } };

/** Stripe redirects here; the order flips to "paid" only when the signed webhook arrives. */
export default async function SuccessPage({ searchParams }: PageProps<"/checkout/success">) {
  const user = await requireCustomer();
  const sid = (await searchParams).session_id;
  const data = typeof sid === "string" && /^cs_(test|live)_[A-Za-z0-9]+$/.test(sid) ? await getOrderBySession(user, sid) : null;
  if (!data)
    return (
      <div className="mx-auto max-w-lg text-center">
        <h1 className="font-heading text-3xl font-semibold">We couldn&apos;t find that order</h1>
        <Link href="/account/orders" className={buttonVariants({ className: "mt-6" })}>
          See my orders
        </Link>
      </div>
    );
  const paid = data.order.status !== "pending";
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="text-center">
        {paid ? <CheckCircle2 className="mx-auto size-10 text-primary" aria-hidden /> : <Clock className="mx-auto size-10 text-muted-foreground" aria-hidden />}
        <h1 className="mt-3 font-heading text-3xl font-semibold">{paid ? "Thank you — your order is confirmed" : "Payment received — confirming…"}</h1>
        <p className="mt-2 text-muted-foreground">
          Order #{data.order.number} <OrderStatus status={data.order.status} />
        </p>
        {!paid ? <p className="mt-2 text-sm text-muted-foreground">Stripe is confirming the payment. Refresh in a few seconds.</p> : null}
      </div>
      <OrderSummary order={data.order} items={data.items} />
      <div className="text-center">
        <Link href="/account/orders" className={buttonVariants({ variant: "outline" })}>
          View all orders
        </Link>
      </div>
    </div>
  );
}
