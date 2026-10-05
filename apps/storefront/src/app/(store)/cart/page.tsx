import { AlertTriangle, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@portfolio/ui/alert";
import { buttonVariants } from "@portfolio/ui/button";
import { EmptyState } from "@portfolio/ui/empty-state";
import { ActionButton } from "@/components/confirm-action-button";
import { CartLines } from "@/components/store/cart-lines";
import { env, features } from "@/lib/env";
import { money } from "@/lib/money";
import { checkoutAction } from "@/server/actions/cart";
import { currentUser } from "@/server/access";
import { currentCart } from "@/server/cart";

export const metadata: Metadata = { title: "Cart", robots: { index: false } };

export default async function CartPage({ searchParams }: PageProps<"/cart">) {
  const [cart, user, sp] = await Promise.all([currentCart(), currentUser(), searchParams]);
  if (!cart.lines.length)
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Your cart is empty"
        description="Find something useful for your kitchen, garden or next trip."
        action={
          <Link href="/products" className={buttonVariants()}>
            Start shopping
          </Link>
        }
      />
    );
  const toFree = env().FREE_SHIPPING_OVER_CENTS - cart.subtotalCents;
  return (
    <div>
      <h1 className="mb-6 font-heading text-3xl font-semibold tracking-tight">Your cart</h1>
      {sp.checkout === "cancelled" ? <p className="mb-4 rounded-lg bg-muted px-4 py-3 text-sm">Checkout was cancelled — your cart is still here.</p> : null}
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {cart.problems.length ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden />
              <AlertTitle>Please update your cart</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {cart.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          <CartLines lines={cart.lines} />
        </div>
        <aside className="h-fit space-y-3 rounded-xl border bg-card p-5" aria-label="Order summary">
          <h2 className="font-semibold">Summary</h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{money(cart.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd className="tabular-nums">{cart.shippingCents ? money(cart.shippingCents) : "Free"}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(cart.totalCents)}</dd>
            </div>
          </dl>
          {toFree > 0 ? <p className="text-xs text-muted-foreground">Add {money(toFree)} more for free shipping.</p> : null}
          {!user ? (
            <Link href="/sign-in?next=%2Fcart" className={buttonVariants({ className: "h-10 w-full" })}>
              Sign in to check out
            </Link>
          ) : features.stripe() ? (
            <ActionButton className="h-10 w-full" disabled={cart.problems.length > 0} action={checkoutAction}>
              Checkout securely with Stripe
            </ActionButton>
          ) : (
            <p className="rounded-md bg-muted p-3 text-xs">Payments are not configured on this server (Stripe test-mode keys required), so checkout is disabled.</p>
          )}
          <p className="text-xs text-muted-foreground">Test mode: use card 4242 4242 4242 4242, any future date and CVC.</p>
        </aside>
      </div>
    </div>
  );
}
