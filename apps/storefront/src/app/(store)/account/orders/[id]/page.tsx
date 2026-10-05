import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { OrderStatus, OrderSummary } from "@/components/store/order-summary";
import { requireCustomer } from "@/server/access";
import { getOrder } from "@/server/orders";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

export default async function OrderPage({ params }: PageProps<"/account/orders/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireCustomer();
  const data = await getOrder(user, id).catch(() => notFound());
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/account/orders" className="text-sm text-muted-foreground hover:text-foreground">
        ← All orders
      </Link>
      <h1 className="flex flex-wrap items-center gap-3 font-heading text-3xl font-semibold tracking-tight">
        Order #{data.order.number} <OrderStatus status={data.order.status} />
      </h1>
      <p className="text-sm text-muted-foreground">Placed {data.order.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
      <OrderSummary order={data.order} items={data.items} />
      {data.order.shippingName ? <p className="text-sm text-muted-foreground">Ship to: {data.order.shippingName}</p> : null}
    </div>
  );
}
