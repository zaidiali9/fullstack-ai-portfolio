import "server-only";
import { and, asc, count, desc, eq, gt, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { paginate, rateLimit, rowsOf, type Page } from "@portfolio/kit";
import { db, schema } from "@/db";
import { categories, type Product } from "@db/schema";
import { getAI } from "@/lib/ai";
import { env } from "@/lib/env";

export const catalogQuery = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.enum(categories).optional(),
  sort: z.enum(["relevance", "price-asc", "price-desc", "newest"]).default("relevance"),
  page: z.coerce.number().int().min(1).max(500).default(1),
});
export type CatalogQuery = z.infer<typeof catalogQuery>;

export type ProductCard = Pick<Product, "id" | "slug" | "name" | "priceCents" | "category" | "imagePath" | "stock">;
const cardColumns = {
  id: schema.products.id,
  slug: schema.products.slug,
  name: schema.products.name,
  priceCents: schema.products.priceCents,
  category: schema.products.category,
  imagePath: schema.products.imagePath,
  stock: schema.products.stock,
};

const PAGE_SIZE = 12;
/** Cosine similarity below this is treated as "not related" for search results. */
export const MIN_SEARCH_SIMILARITY = 0.25;

export interface SearchMeta {
  mode: "semantic" | "keyword" | "browse";
  /** Why semantic search wasn't used, if it wasn't. */
  fallbackReason?: "embeddings_unavailable" | "rate_limited";
}

function rrf(lists: string[][], k = 60) {
  const scores = new Map<string, number>();
  lists.forEach((list) => list.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1))));
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** Keyword ranking: full-text match OR substring on the name, best first. */
async function keywordIds(q: string, category?: string): Promise<string[]> {
  const words = [...new Set(q.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])].slice(0, 10);
  if (!words.length) return [];
  const tsq = words.join(" | ");
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      select id from products
      where active = true ${category ? sql`and category = ${category}` : sql``}
        and (to_tsvector('english', name || ' ' || category || ' ' || description) @@ to_tsquery('english', ${tsq})
             or name ilike ${"%" + q + "%"})
      order by ts_rank_cd(to_tsvector('english', name || ' ' || category || ' ' || description), to_tsquery('english', ${tsq})) desc
      limit 60`),
  );
  return rows.map((r) => r.id);
}

/** Semantic ranking by embedding similarity (above MIN_SEARCH_SIMILARITY). */
async function semanticIds(q: string, category?: string): Promise<string[]> {
  const [vec] = await getAI().embed({ feature: "search", texts: [q] });
  const literal = `[${vec!.join(",")}]`;
  const rows = rowsOf<{ id: string; distance: number }>(
    await db.execute(sql`
      select id, embedding <=> ${literal}::vector as distance from products
      where active = true and embedding is not null ${category ? sql`and category = ${category}` : sql``}
      order by embedding <=> ${literal}::vector
      limit 60`),
  );
  return rows.filter((r) => 1 - Number(r.distance) >= MIN_SEARCH_SIMILARITY).map((r) => r.id);
}

/**
 * Rank product ids for a free-text query. Semantic + keyword fused with reciprocal rank fusion when
 * embeddings are available; keyword only otherwise (or when the caller is over the search rate limit).
 */
export async function searchProductIds(q: string, opts: { category?: string; clientKey?: string } = {}): Promise<{ ids: string[]; meta: SearchMeta }> {
  const ai = getAI();
  let fallbackReason: SearchMeta["fallbackReason"];
  if (!ai.status().embeddings.available) fallbackReason = "embeddings_unavailable";
  else if (opts.clientKey) {
    const r = await rateLimit(db, `search:${opts.clientKey}`, { limit: env().SEARCH_PER_MINUTE, windowMs: 60_000 });
    if (!r.ok) fallbackReason = "rate_limited";
  }
  const keyword = await keywordIds(q, opts.category);
  if (fallbackReason) return { ids: keyword, meta: { mode: "keyword", fallbackReason } };
  const semantic = await semanticIds(q, opts.category);
  return { ids: rrf([semantic, keyword]), meta: { mode: "semantic" } };
}

export async function listProducts(query: CatalogQuery, clientKey?: string): Promise<{ page: Page<ProductCard>; meta: SearchMeta }> {
  const offset = (query.page - 1) * PAGE_SIZE;
  if (query.q) {
    const { ids, meta } = await searchProductIds(query.q, { category: query.category, clientKey });
    let ordered = ids;
    if (query.sort !== "relevance" && ids.length) {
      const sorted = await db
        .select({ id: schema.products.id })
        .from(schema.products)
        .where(inArray(schema.products.id, ids))
        .orderBy(query.sort === "price-asc" ? asc(schema.products.priceCents) : query.sort === "price-desc" ? desc(schema.products.priceCents) : desc(schema.products.createdAt));
      ordered = sorted.map((r) => r.id);
    }
    const pageIds = ordered.slice(offset, offset + PAGE_SIZE);
    const rows = pageIds.length ? await db.select(cardColumns).from(schema.products).where(inArray(schema.products.id, pageIds)) : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return { page: paginate(pageIds.map((id) => byId.get(id)!).filter(Boolean), ordered.length, query.page, PAGE_SIZE), meta };
  }
  const where = and(eq(schema.products.active, true), query.category ? eq(schema.products.category, query.category) : undefined);
  const order: SQL[] =
    query.sort === "price-asc"
      ? [asc(schema.products.priceCents)]
      : query.sort === "price-desc"
        ? [desc(schema.products.priceCents)]
        : query.sort === "newest"
          ? [desc(schema.products.createdAt)]
          : [desc(schema.products.featured), asc(schema.products.name)];
  const [items, [total]] = await Promise.all([
    db.select(cardColumns).from(schema.products).where(where).orderBy(...order).limit(PAGE_SIZE).offset(offset),
    db.select({ n: count() }).from(schema.products).where(where),
  ]);
  return { page: paginate(items, total?.n ?? 0, query.page, PAGE_SIZE), meta: { mode: "browse" } };
}

export async function featuredProducts(limit = 8): Promise<ProductCard[]> {
  return db
    .select(cardColumns)
    .from(schema.products)
    .where(and(eq(schema.products.active, true), eq(schema.products.featured, true)))
    .orderBy(asc(schema.products.name))
    .limit(limit);
}

export async function categoryCounts() {
  const rows = await db
    .select({ category: schema.products.category, n: count() })
    .from(schema.products)
    .where(eq(schema.products.active, true))
    .groupBy(schema.products.category);
  return Object.fromEntries(rows.map((r) => [r.category, r.n])) as Partial<Record<(typeof categories)[number], number>>;
}

export async function getProductBySlug(slug: string, opts: { includeInactive?: boolean } = {}) {
  const [p] = await db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.slug, slug), opts.includeInactive ? undefined : eq(schema.products.active, true)))
    .limit(1);
  return p ?? null;
}

/**
 * "Similar items": nearest neighbours by embedding among other active products (in-stock first).
 * Falls back to the same category when the product has no embedding.
 */
export async function similarProducts(product: Pick<Product, "id" | "category" | "embedding">, k = 4): Promise<{ items: ProductCard[]; method: "embedding" | "category" }> {
  if (product.embedding) {
    const literal = `[${product.embedding.join(",")}]`;
    const items = await db
      .select(cardColumns)
      .from(schema.products)
      .where(and(eq(schema.products.active, true), ne(schema.products.id, product.id), sql`${schema.products.embedding} is not null`))
      .orderBy(sql`(${schema.products.stock} > 0) desc`, sql`${schema.products.embedding} <=> ${literal}::vector`)
      .limit(k);
    return { items, method: "embedding" };
  }
  const items = await db
    .select(cardColumns)
    .from(schema.products)
    .where(and(eq(schema.products.active, true), ne(schema.products.id, product.id), eq(schema.products.category, product.category), gt(schema.products.stock, 0)))
    .orderBy(asc(schema.products.name))
    .limit(k);
  return { items, method: "category" };
}

export const embeddingText = (p: Pick<Product, "name" | "category" | "description">) => `${p.name}. Category: ${p.category}. ${p.description}`;

/** Embed products whose text changed (embedding cleared). No-op when embeddings are unavailable. */
export async function embedPendingProducts(limit = 200): Promise<number> {
  const ai = getAI();
  if (!ai.status().embeddings.available) return 0;
  const pending = await db
    .select({ id: schema.products.id, name: schema.products.name, category: schema.products.category, description: schema.products.description })
    .from(schema.products)
    .where(isNull(schema.products.embedding))
    .limit(limit);
  if (!pending.length) return 0;
  const vectors = await ai.embed({ feature: "product_embed", texts: pending.map(embeddingText) });
  await db.transaction(async (tx) => {
    for (const [i, p] of pending.entries()) await tx.update(schema.products).set({ embedding: vectors[i]! }).where(eq(schema.products.id, p.id));
  });
  return pending.length;
}
