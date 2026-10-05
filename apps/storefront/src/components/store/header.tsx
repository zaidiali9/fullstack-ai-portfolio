import { Search, ShoppingBag, UserRound } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { Input } from "@portfolio/ui/input";
import { ThemeToggle } from "@portfolio/ui/theme-toggle";
import { Brand } from "@/components/brand";
import { cn } from "@/lib/utils";
import { categories } from "@db/schema";
import { AccountMenu } from "./account-menu";

export const CATEGORY_LABEL: Record<(typeof categories)[number], string> = {
  kitchen: "Kitchen",
  outdoor: "Outdoor",
  home: "Home",
  bath: "Bath",
  stationery: "Stationery",
  garden: "Garden",
};

/** Server-rendered header; the search box is a plain GET form (works without JavaScript). */
export function StoreHeader({ cartCount, user, q }: { cartCount: number; user: { name: string; role: string } | null; q?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Brand className="shrink-0" />
        <form action="/products" method="get" role="search" className="relative ml-auto hidden max-w-sm flex-1 md:block">
          <label htmlFor="site-search" className="sr-only">
            Search products
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="site-search" name="q" defaultValue={q} placeholder="Search, e.g. “keep coffee hot on a hike”" className="h-9 pl-8" />
        </form>
        <nav className="ml-auto flex items-center gap-1 md:ml-0" aria-label="Account and cart">
          <ThemeToggle />
          {user ? (
            <AccountMenu name={user.name} isAdmin={user.role === "admin"} />
          ) : (
            <Link href="/sign-in" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Sign in">
              <UserRound className="size-5" aria-hidden />
            </Link>
          )}
          <Link href="/cart" className={cn(buttonVariants({ variant: "ghost" }), "relative h-9 gap-1.5 px-2")} aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}>
            <ShoppingBag className="size-5" aria-hidden />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-brand-clay px-1 text-xs font-semibold text-white" aria-hidden>
                {cartCount}
              </span>
            ) : null}
          </Link>
        </nav>
      </div>
      <nav className="border-t" aria-label="Categories">
        <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-1.5 text-sm">
          <li>
            <Link href="/products" className="block rounded-md px-2.5 py-1 whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground">
              All
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c}>
              <Link href={`/products?category=${c}`} className="block rounded-md px-2.5 py-1 whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground">
                {CATEGORY_LABEL[c]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <form action="/products" method="get" role="search" className="border-t px-4 py-2 md:hidden">
        <label htmlFor="site-search-mobile" className="sr-only">
          Search products
        </label>
        <Input id="site-search-mobile" name="q" defaultValue={q} placeholder="Search products" className="h-9" />
      </form>
    </header>
  );
}

export function StoreFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <p>Fernwood Supply is a portfolio demo store. Products are fictional seed data; checkout uses Stripe test mode.</p>
        <p>Free shipping over $75.</p>
      </div>
    </footer>
  );
}
