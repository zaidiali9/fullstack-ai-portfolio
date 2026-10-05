import { PackageSearch, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { clientIp } from "@portfolio/kit";
import { buttonVariants } from "@portfolio/ui/button";
import { EmptyState } from "@portfolio/ui/empty-state";
import { PaginationNav } from "@portfolio/ui/pagination-nav";
import { CATEGORY_LABEL } from "@/components/store/header";
import { ProductGrid } from "@/components/store/product-card";
import { catalogQuery, listProducts } from "@/server/catalog";

export async function generateMetadata({ searchParams }: PageProps<"/products">): Promise<Metadata> {
  const sp = await searchParams;
  const parsed = catalogQuery.safeParse(sp);
  const cat = parsed.success && parsed.data.category ? CATEGORY_LABEL[parsed.data.category] : null;
  return {
    title: parsed.success && parsed.data.q ? `Search: ${parsed.data.q}` : cat ?? "All products",
    description: cat ? `Shop ${cat.toLowerCase()} goods at Fernwood Supply.` : "Browse every product at Fernwood Supply.",
    alternates: { canonical: cat ? `/products?category=${parsed.success ? parsed.data.category : ""}` : "/products" },
    robots: parsed.success && parsed.data.q ? { index: false } : undefined,
  };
}

const sortSelect =
  "h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v)) as Record<string, string>;
  const parsed = catalogQuery.safeParse(raw);
  const query = parsed.success ? parsed.data : catalogQuery.parse({});
  const ip = clientIp(await headers());
  const { page, meta } = await listProducts(query, ip);
  const title = query.q ? `Results for “${query.q}”` : query.category ? CATEGORY_LABEL[query.category] : "All products";
  const href = (p: number) => `/products?${new URLSearchParams({ ...raw, page: String(p) })}`;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">{title}</h1>
          {query.q ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              {meta.mode === "semantic" ? (
                <>
                  <Sparkles className="size-3.5" aria-hidden /> Semantic search: matched by meaning and keywords.
                </>
              ) : meta.fallbackReason === "rate_limited" ? (
                "Keyword search (semantic search is busy — try again in a minute)."
              ) : (
                "Keyword search (semantic search unavailable on this server)."
              )}
            </p>
          ) : null}
        </div>
        <form method="get" action="/products" className="flex items-center gap-2">
          {query.q ? <input type="hidden" name="q" value={query.q} /> : null}
          {query.category ? <input type="hidden" name="category" value={query.category} /> : null}
          <label htmlFor="sort" className="text-sm text-muted-foreground">
            Sort
          </label>
          <select id="sort" name="sort" defaultValue={query.sort} className={sortSelect}>
            <option value="relevance">{query.q ? "Best match" : "Featured"}</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="newest">Newest</option>
          </select>
          <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Apply
          </button>
        </form>
      </div>
      {page.items.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No products found"
          description={query.q ? "Try different words — describe what you want to do with it." : "This category is empty right now."}
          action={
            <Link href="/products" className={buttonVariants()}>
              Browse everything
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          <ProductGrid items={page.items} priorityCount={4} />
          <PaginationNav page={page.page} totalPages={page.totalPages} total={page.total} hrefFor={href} label="products" />
        </div>
      )}
    </div>
  );
}
