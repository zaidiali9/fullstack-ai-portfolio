"use client";
import { Minus, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@portfolio/ui/button";
import { money } from "@/lib/money";
import { updateCartAction } from "@/server/actions/cart";

interface Line {
  productId: string;
  slug: string;
  name: string;
  imagePath: string;
  unitPriceCents: number;
  quantity: number;
  stock: number;
}

/** Quantity changes update instantly (optimistic) and roll back with a toast if the server refuses. */
export function CartLines({ lines }: { lines: Line[] }) {
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(lines, (state, change: { productId: string; quantity: number }) =>
    state.flatMap((l) => (l.productId === change.productId ? (change.quantity === 0 ? [] : [{ ...l, quantity: change.quantity }]) : [l])),
  );
  const change = (productId: string, quantity: number) =>
    start(async () => {
      setOptimistic({ productId, quantity });
      const res = await updateCartAction(productId, quantity);
      if (res.status === "error") toast.error(res.message ?? "Couldn't update your cart");
    });

  return (
    <ul className="divide-y rounded-xl border bg-card" aria-busy={pending}>
      {optimistic.map((l) => (
        <li key={l.productId} className="flex gap-4 p-4">
          <Link href={`/products/${l.slug}`} className="relative size-20 shrink-0 overflow-hidden rounded-lg border bg-muted sm:size-24">
            <Image src={l.imagePath} alt="" fill sizes="96px" className="object-cover" />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <Link href={`/products/${l.slug}`} className="font-medium hover:underline">
                {l.name}
              </Link>
              <p className="text-sm text-muted-foreground">{money(l.unitPriceCents)} each</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-lg border" role="group" aria-label={`Quantity of ${l.name}`}>
                <Button variant="ghost" size="icon-sm" aria-label="Decrease quantity" onClick={() => change(l.productId, l.quantity - 1)}>
                  <Minus className="size-3.5" aria-hidden />
                </Button>
                <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
                  {l.quantity}
                </span>
                <Button variant="ghost" size="icon-sm" aria-label="Increase quantity" disabled={l.quantity >= Math.min(l.stock, 20)} onClick={() => change(l.productId, l.quantity + 1)}>
                  <Plus className="size-3.5" aria-hidden />
                </Button>
              </div>
              <p className="w-20 text-right font-medium tabular-nums">{money(l.unitPriceCents * l.quantity)}</p>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${l.name}`} onClick={() => change(l.productId, 0)}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
