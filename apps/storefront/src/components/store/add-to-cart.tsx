"use client";
import { ShoppingBag } from "lucide-react";
import { useActionState } from "react";
import { Label } from "@portfolio/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { useFormToast } from "@/components/use-form-toast";
import { idle } from "@/lib/form-state";
import { addToCartAction } from "@/server/actions/cart";

export function AddToCart({ productId, stock }: { productId: string; stock: number }) {
  const [state, action] = useActionState(addToCartAction, idle);
  useFormToast(state);
  if (stock === 0) return <p className="rounded-lg bg-muted px-4 py-3 text-sm font-medium">Sold out</p>;
  return (
    <form action={action} className="flex items-end gap-3">
      <input type="hidden" name="productId" value={productId} />
      <div className="space-y-1">
        <Label htmlFor="quantity">Quantity</Label>
        <select
          id="quantity"
          name="quantity"
          defaultValue="1"
          className="h-10 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {Array.from({ length: Math.min(stock, 10) }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton className="h-10 flex-1 px-5 sm:flex-none" pendingText="Adding">
        <ShoppingBag className="size-4" aria-hidden /> Add to cart
      </SubmitButton>
    </form>
  );
}
