import "server-only";
import { inArray, sql } from "drizzle-orm";
import { rowsOf } from "@portfolio/kit";
import { db, schema } from "@/db";
import { getAI } from "@/lib/ai";
import { reciprocalRankFusion, type Ranked, type Source } from "./core";

export interface Retrieval {
  sources: Source[];
  method: "hybrid" | "keyword" | "none";
  /** Best cosine similarity among vector hits (null when embeddings are unavailable). */
  bestSimilarity: number | null;
}

/** Below this cosine similarity, vector hits are treated as unrelated (MiniLM, normalized vectors). */
export const MIN_SIMILARITY = 0.3;
const CANDIDATES = 20;

/**
 * Hybrid retrieval scoped to ONE workspace: pgvector cosine search + Postgres full-text search,
 * fused with reciprocal rank fusion. Only chunks of `ready` documents are searched.
 */
export async function retrieve(workspaceId: string, query: string, k = 5): Promise<Retrieval> {
  const ai = getAI({ workspaceId });
  const q = query.slice(0, 1000);
  let vectorRanked: Ranked[] = [];
  let bestSimilarity: number | null = null;

  if (ai.status().embeddings.available) {
    const [vec] = await ai.embed({ feature: "retrieve", texts: [q] });
    const literal = `[${vec!.join(",")}]`;
    const rows = rowsOf<{ id: string; distance: number }>(
      await db.execute(sql`
        select c.id, c.embedding <=> ${literal}::vector as distance
        from chunks c join documents d on d.id = c.document_id
        where c.workspace_id = ${workspaceId} and d.status = 'ready' and c.embedding is not null
        order by c.embedding <=> ${literal}::vector
        limit ${CANDIDATES}`),
    );
    const relevant = rows.filter((r) => 1 - Number(r.distance) >= MIN_SIMILARITY);
    bestSimilarity = rows.length ? 1 - Number(rows[0]!.distance) : null;
    vectorRanked = relevant.map((r, i) => ({ id: r.id, rank: i + 1 }));
  }

  // Keyword search: OR of significant words so partial matches still rank.
  const words = [...new Set(q.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].slice(0, 16);
  let keywordRanked: Ranked[] = [];
  if (words.length) {
    const tsq = words.join(" | ");
    const rows = rowsOf<{ id: string }>(
      await db.execute(sql`
        select c.id
        from chunks c join documents d on d.id = c.document_id
        where c.workspace_id = ${workspaceId} and d.status = 'ready'
          and to_tsvector('english', c.content) @@ to_tsquery('english', ${tsq})
        order by ts_rank_cd(to_tsvector('english', c.content), to_tsquery('english', ${tsq})) desc
        limit ${CANDIDATES}`),
    );
    keywordRanked = rows.map((r, i) => ({ id: r.id, rank: i + 1 }));
  }

  // When embeddings exist and nothing is semantically close, keyword hits alone are too weak
  // (common words match everywhere): answer "not found" instead of feeding noise to the model.
  if (bestSimilarity !== null && vectorRanked.length === 0) return { sources: [], method: "none", bestSimilarity };

  const fused = reciprocalRankFusion([vectorRanked, keywordRanked]).slice(0, k);
  if (fused.length === 0) return { sources: [], method: "none", bestSimilarity };
  const rows = await db
    .select({
      id: schema.chunks.id,
      documentId: schema.chunks.documentId,
      content: schema.chunks.content,
      page: schema.chunks.page,
      title: schema.documents.title,
    })
    .from(schema.chunks)
    .innerJoin(schema.documents, sql`${schema.documents.id} = ${schema.chunks.documentId}`)
    .where(inArray(schema.chunks.id, fused.map((f) => f.id)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const sources = fused
    .map((f) => byId.get(f.id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ chunkId: r.id, documentId: r.documentId, title: r.title, page: r.page, content: r.content }));
  return { sources, method: vectorRanked.length ? "hybrid" : "keyword", bestSimilarity };
}
