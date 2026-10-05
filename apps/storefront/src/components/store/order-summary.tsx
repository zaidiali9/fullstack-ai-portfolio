import { Badge } from "@portfolio/ui/badge";
import type { Order, OrderItem } from "@db/schema";
import { money } from "@/lib/money";

const STATUS: Record<Order["status"], string> = { pending: "Awaiting payment", paid: "Paid", fulfilled: "Shipped", cancelled: "Cancelled", refunded: "Refunded" };

export function OrderStatus({ status }: { status: Order["status"] }) {
  return <Badge variant={status === "cancelled" || status === "refunded" ? "outline" : status === "pending" ? "secondary" : "default"}>{STATUS[status]}</Badge>;
}

export function OrderSummary({ order, items }: { order: Order; items: OrderItem[] }) {
  return (
    <div className="rounded-xl border bg-card">
      <ul className="divide-y">
        {items.map((it) => (
          <li key={it.id} className="flex justify-between gap-3 px-5 py-3 text-sm">
            <span>
              {it.name} <span className="text-muted-foreground">× {it.quantity}</span>
            </span>
            <span className="tabular-nums">{money(it.unitPriceCents * it.quantity)}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 border-t px-5 py-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular-nums">{money(order.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Shipping</dt>
          <dd className="tabular-nums">{order.shippingCents ? money(order.shippingCents) : "Free"}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{money(order.totalCents)}</dd>
        </div>
      </dl>
    </div>
  );
}
