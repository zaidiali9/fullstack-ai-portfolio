import { ArrowRight, Sparkles, Truck } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { ProductGrid } from "@/components/store/product-card";
import { CATEGORY_LABEL } from "@/components/store/header";
import { cn } from "@/lib/utils";
import { categoryCounts, featuredProducts } from "@/server/catalog";
import { categories } from "@db/schema";

export const revalidate = 300;

export default async function Home() {
  const [featured, counts] = await Promise.all([featuredProducts(8), categoryCounts()]);
  return (
    <div className="space-y-14">
      <section className="grid items-center gap-8 rounded-2xl bg-secondary px-6 py-12 sm:px-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-sm font-medium text-brand-clay">Portfolio demo store · seed data</p>
          <h1 className="mt-2 font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Practical goods for home and trail.</h1>
          <p className="mt-4 max-w-lg text-lg text-muted-foreground">
            Search the way you talk — try “something to keep coffee hot on a hike” — and find what fits, even when it doesn&apos;t use your words.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/products" className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}>
              Shop everything <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/products?q=something+to+keep+coffee+hot+on+a+hike" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-4")}>
              <Sparkles className="size-4" aria-hidden /> Try semantic search
            </Link>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {categories.map((c) => (
            <li key={c}>
              <Link href={`/products?category=${c}`} className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <span className="font-medium">{CATEGORY_LABEL[c]}</span>
                <span className="block text-sm text-muted-foreground">{counts[c] ?? 0} items</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="featured">
        <div className="mb-5 flex items-end justify-between">
          <h2 id="featured" className="font-heading text-2xl font-semibold">
            Featured
          </h2>
          <Link href="/products" className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
        <ProductGrid items={featured} priorityCount={4} />
      </section>

      <section className="flex items-center gap-3 rounded-xl border p-5 text-sm">
        <Truck className="size-5 text-primary" aria-hidden />
        <p>Free shipping on orders over $75 · Checkout runs on Stripe in test mode — use card 4242 4242 4242 4242.</p>
      </section>
    </div>
  );
}
