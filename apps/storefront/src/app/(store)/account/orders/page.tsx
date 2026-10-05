import { Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { EmptyState } from "@portfolio/ui/empty-state";
import { OrderStatus } from "@/components/store/order-summary";
import { money } from "@/lib/money";
import { requireCustomer } from "@/server/access";
import { listMyOrders } from "@/server/orders";

export const metadata: Metadata = { title: "My orders", robots: { index: false } };

export default async function OrdersPage() {
  const user = await requireCustomer();
  const orders = await listMyOrders(user.id);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 font-heading text-3xl font-semibold tracking-tight">My orders</h1>
      {orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No orders yet"
          action={
            <Link href="/products" className={buttonVariants()}>
              Start shopping
            </Link>
          }
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/account/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                <span className="font-medium">Order #{o.number}</span>
                <span className="text-sm text-muted-foreground">{o.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
                <OrderStatus status={o.status} />
                <span className="font-medium tabular-nums">{money(o.totalCents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
