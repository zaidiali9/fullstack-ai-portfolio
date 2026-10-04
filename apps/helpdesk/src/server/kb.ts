import "server-only";
import { and, count, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { notFound as notFoundError, paginate, rowsOf, type Page } from "@portfolio/kit";
import { db, schema } from "@/db";
import type { KbArticle } from "@db/schema";
import { getAI } from "@/lib/ai";
import { audit } from "./audit";
import type { OrgContext } from "./authz";
import { can } from "./permissions";

export const articleInput = z.object({
  title: z.string().trim().min(3, "Title is too short").max(160),
  body: z.string().trim().min(10, "Body is too short").max(20_000),
  published: z.coerce.boolean().default(true),
});

export type ArticleListItem = Pick<KbArticle, "id" | "title" | "published" | "updatedAt"> & { excerpt: string; embedded: boolean };

export async function listArticles(ctx: OrgContext, opts: { q?: string; page: number; pageSize: number }): Promise<Page<ArticleListItem>> {
  const where = and(
    eq(schema.kbArticles.orgId, ctx.org.id),
    can(ctx.role, "kb:read:drafts") ? undefined : eq(schema.kbArticles.published, true),
    opts.q ? or(ilike(schema.kbArticles.title, `%${opts.q}%`), ilike(schema.kbArticles.body, `%${opts.q}%`)) : undefined,
  );
  const [items, [total]] = await Promise.all([
    db
      .select({
        id: schema.kbArticles.id,
        title: schema.kbArticles.title,
        published: schema.kbArticles.published,
        updatedAt: schema.kbArticles.updatedAt,
        excerpt: sql<string>`left(${schema.kbArticles.body}, 180)`,
        embedded: sql<boolean>`${schema.kbArticles.embedding} is not null`,
      })
      .from(schema.kbArticles)
      .where(where)
      .orderBy(desc(schema.kbArticles.updatedAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize),
    db.select({ n: count() }).from(schema.kbArticles).where(where),
  ]);
  return paginate(items, total?.n ?? 0, opts.page, opts.pageSize);
}

export async function getArticle(ctx: OrgContext, id: string) {
  const [a] = await db
    .select()
    .from(schema.kbArticles)
    .where(and(eq(schema.kbArticles.id, id), eq(schema.kbArticles.orgId, ctx.org.id)))
    .limit(1);
  if (!a || (!a.published && !can(ctx.role, "kb:read:drafts"))) throw notFoundError("Article");
  return a;
}

export async function createArticle(ctx: OrgContext, input: z.infer<typeof articleInput>) {
  return db.transaction(async (tx) => {
    const [a] = await tx
      .insert(schema.kbArticles)
      .values({ orgId: ctx.org.id, authorId: ctx.user.id, ...input })
      .returning();
    await audit(tx, { orgId: ctx.org.id, actorId: ctx.user.id, action: "kb.created", targetType: "kb_article", targetId: a!.id, meta: { title: input.title } });
    return a!;
  });
}

export async function updateArticle(ctx: OrgContext, id: string, input: z.infer<typeof articleInput>) {
  return db.transaction(async (tx) => {
    const [a] = await tx
      .update(schema.kbArticles)
      // Content changed: drop the stale embedding; it is recomputed after the response.
      .set({ ...input, embedding: null, embeddingModel: null })
      .where(and(eq(schema.kbArticles.id, id), eq(schema.kbArticles.orgId, ctx.org.id)))
      .returning();
    if (!a) throw notFoundError("Article");
    await audit(tx, { orgId: ctx.org.id, actorId: ctx.user.id, action: "kb.updated", targetType: "kb_article", targetId: id, meta: { title: input.title } });
    return a;
  });
}

export async function deleteArticle(ctx: OrgContext, id: string) {
  await db.transaction(async (tx) => {
    const [a] = await tx
      .delete(schema.kbArticles)
      .where(and(eq(schema.kbArticles.id, id), eq(schema.kbArticles.orgId, ctx.org.id)))
      .returning({ title: schema.kbArticles.title });
    if (!a) throw notFoundError("Article");
    await audit(tx, { orgId: ctx.org.id, actorId: ctx.user.id, action: "kb.deleted", targetType: "kb_article", targetId: id, meta: { title: a.title } });
  });
}

/** Embed articles that have no embedding yet. Safe to call repeatedly; no-op when AI is unavailable. */
export async function embedPendingArticles(orgId: string, limit = 50): Promise<number> {
  const ai = getAI({ orgId });
  if (!ai.status().embeddings.available) return 0;
  const pending = await db
    .select({ id: schema.kbArticles.id, title: schema.kbArticles.title, body: schema.kbArticles.body })
    .from(schema.kbArticles)
    .where(and(eq(schema.kbArticles.orgId, orgId), sql`${schema.kbArticles.embedding} is null`))
    .limit(limit);
  if (pending.length === 0) return 0;
  const vectors = await ai.embed({ feature: "kb.embed", texts: pending.map((a) => `${a.title}\n\n${a.body}`) });
  const model = ai.status().embeddings.model;
  await db.transaction(async (tx) => {
    for (let i = 0; i < pending.length; i++) {
      await tx.update(schema.kbArticles).set({ embedding: vectors[i]!, embeddingModel: model }).where(eq(schema.kbArticles.id, pending[i]!.id));
    }
  });
  return pending.length;
}

export interface RetrievedArticle {
  id: string;
  title: string;
  body: string;
  score: number;
  method: "vector" | "fulltext";
}

/**
 * Find the most relevant published articles for a query. Uses pgvector cosine similarity when
 * embeddings are available, otherwise Postgres full-text search. Always scoped to one org.
 */
export async function retrieveArticles(orgId: string, query: string, k = 3): Promise<RetrievedArticle[]> {
  const ai = getAI({ orgId });
  const q = query.slice(0, 2000);
  if (ai.status().embeddings.available) {
    try {
      const [vec] = await ai.embed({ feature: "kb.retrieve", texts: [q] });
      const literal = `[${vec!.join(",")}]`;
      const rows = await db
        .select({
          id: schema.kbArticles.id,
          title: schema.kbArticles.title,
          body: schema.kbArticles.body,
          distance: sql<number>`${schema.kbArticles.embedding} <=> ${literal}::vector`,
        })
        .from(schema.kbArticles)
        .where(and(eq(schema.kbArticles.orgId, orgId), eq(schema.kbArticles.published, true), isNotNull(schema.kbArticles.embedding)))
        .orderBy(sql`${schema.kbArticles.embedding} <=> ${literal}::vector`)
        .limit(k);
      // Cosine distance > 0.8 means essentially unrelated; don't feed noise to the model.
      const relevant = rows.filter((r) => Number(r.distance) < 0.8);
      if (relevant.length > 0) return relevant.map((r) => ({ id: r.id, title: r.title, body: r.body, score: 1 - Number(r.distance), method: "vector" as const }));
    } catch (err) {
      console.warn("[kb] vector retrieval failed, falling back to full-text", err);
    }
  }
  const result = await db.execute(sql`
    select id, title, body,
      ts_rank(to_tsvector('english', title || ' ' || body), websearch_to_tsquery('english', ${q})) as score
    from kb_articles
    where org_id = ${orgId} and published = true
      and to_tsvector('english', title || ' ' || body) @@ websearch_to_tsquery('english', ${q})
    order by score desc
    limit ${k}`);
  const rows = rowsOf<{ id: string; title: string; body: string; score: number }>(result);
  if (rows.length > 0) return rows.map((r) => ({ ...r, score: Number(r.score), method: "fulltext" as const }));
  // websearch_to_tsquery ANDs all terms; retry with OR of the significant words.
  const words = [...new Set(q.toLowerCase().match(/[a-z]{4,}/g) ?? [])].slice(0, 12);
  if (words.length === 0) return [];
  const orQuery = words.join(" | ");
  const loose = rowsOf<{ id: string; title: string; body: string; score: number }>(
    await db.execute(sql`
      select id, title, body,
        ts_rank(to_tsvector('english', title || ' ' || body), to_tsquery('english', ${orQuery})) as score
      from kb_articles
      where org_id = ${orgId} and published = true
        and to_tsvector('english', title || ' ' || body) @@ to_tsquery('english', ${orQuery})
      order by score desc
      limit ${k}`),
  );
  return loose.map((r) => ({ ...r, score: Number(r.score), method: "fulltext" as const }));
}
