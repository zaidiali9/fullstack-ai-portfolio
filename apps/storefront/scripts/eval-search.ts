/**
 * Search relevance eval on the seeded catalog (real embedding model, no stubs). Compares three
 * rankers on hand-written shopper queries that mostly avoid the products' own words:
 *   keyword (Postgres full-text), semantic (pgvector), hybrid (RRF of both = production).
 * Metrics: hit@3 (an expected product in the top 3) and MRR (mean reciprocal rank of the first hit).
 *   AI_LOCAL_MODELS=true npm run eval
 */
import fs from "node:fs";
import path from "node:path";
import { db, dbHandle, schema } from "@/db";
import { getAI } from "@/lib/ai";
import { searchProductIds } from "@/server/catalog";

const CASES: { q: string; expect: string[] }[] = [
  { q: "something to keep coffee hot on a hike", expect: ["trailhead-insulated-bottle-750-ml"] },
  { q: "light for the tent at night", expect: ["ridgeline-camping-lantern"] },
  { q: "where two people sleep on a backpacking trip", expect: ["two-person-backpacking-tent"] },
  { q: "pan I can cook on over a campfire", expect: ["cast-iron-skillet-10-in"] },
  { q: "airtight containers for oats and pasta", expect: ["glass-pantry-jar-set"] },
  { q: "notebook that works in the rain", expect: ["waterproof-field-notebook"] },
  { q: "candle that smells like a cabin", expect: ["soy-candle-cedar-smoke"] },
  { q: "warm throw for the couch", expect: ["wool-throw-blanket", "packable-down-blanket"] },
  { q: "keep my houseplants watered while I travel", expect: ["self-watering-planter"] },
  { q: "grow basil on the windowsill", expect: ["terracotta-herb-pot-trio", "seed-starter-kit"] },
  { q: "protect my hands from thorns", expect: ["gardening-gloves"] },
  { q: "relaxing soak after a long hike", expect: ["cedar-bath-soak"] },
  { q: "quick-drying towel for a small bathroom", expect: ["waffle-bath-towel"] },
  { q: "planner journal for bullet journaling", expect: ["dot-grid-journal-a5"] },
  { q: "something to write with ink that looks classy", expect: ["brass-fountain-pen"] },
  { q: "seat to bring to the campfire", expect: ["folding-camp-chair"] },
  { q: "grow vegetables on a small patio", expect: ["raised-bed-planter-box", "seed-starter-kit"] },
  { q: "keep my desk tidy", expect: ["desk-organizer-box"] },
];

type Ranker = "keyword" | "semantic" | "hybrid";

async function main() {
  const ai = getAI();
  if (!ai.status().embeddings.available) throw new Error("Embeddings unavailable: set AI_LOCAL_MODELS=true (or HF_TOKEN / OLLAMA_BASE_URL) and re-seed.");
  const all = await db.select({ id: schema.products.id, slug: schema.products.slug }).from(schema.products);
  const slugOf = new Map(all.map((p) => [p.id, p.slug]));
  const rows = [];
  const scores: Record<Ranker, { hits: number; rr: number }> = { keyword: { hits: 0, rr: 0 }, semantic: { hits: 0, rr: 0 }, hybrid: { hits: 0, rr: 0 } };

  for (const c of CASES) {
    const hybrid = (await searchProductIds(c.q)).ids;
    // Same building blocks, isolated: keyword-only path (forced fallback) and semantic-only ranking.
    const keyword = await keywordOnly(c.q);
    const semantic = await semanticOnly(c.q);
    const row: Record<string, unknown> = { q: c.q, expect: c.expect };
    for (const [name, ids] of [["keyword", keyword], ["semantic", semantic], ["hybrid", hybrid]] as const) {
      const slugs = ids.map((id) => slugOf.get(id)!);
      const rank = slugs.findIndex((s) => c.expect.includes(s)) + 1;
      if (rank >= 1 && rank <= 3) scores[name].hits++;
      scores[name].rr += rank >= 1 ? 1 / rank : 0;
      row[name] = { rank: rank || null, top3: slugs.slice(0, 3) };
    }
    rows.push(row);
    const r = row as Record<Ranker, { rank: number | null }>;
    console.log(`${c.q.padEnd(48)} keyword:${String(r.keyword.rank ?? "-").padStart(2)}  semantic:${String(r.semantic.rank ?? "-").padStart(2)}  hybrid:${String(r.hybrid.rank ?? "-").padStart(2)}`);
  }
  const n = CASES.length;
  const pct = (x: number) => Math.round((x / n) * 1000) / 10;
  const summary = {
    embeddings: ai.status().embeddings.model,
    cases: n,
    keyword: { hitAt3Pct: pct(scores.keyword.hits), mrr: Math.round((scores.keyword.rr / n) * 1000) / 1000 },
    semantic: { hitAt3Pct: pct(scores.semantic.hits), mrr: Math.round((scores.semantic.rr / n) * 1000) / 1000 },
    hybrid: { hitAt3Pct: pct(scores.hybrid.hits), mrr: Math.round((scores.hybrid.rr / n) * 1000) / 1000 },
    ranAt: new Date().toISOString(),
    command: "npm run eval (apps/storefront/scripts/eval-search.ts)",
  };
  const out = path.resolve(import.meta.dirname, "../docs/metrics/eval-search.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
  console.log("\nSUMMARY", JSON.stringify(summary, null, 2));
}

// Isolated rankers for comparison (same SQL as production, see src/server/catalog.ts).
async function keywordOnly(q: string): Promise<string[]> {
  const { rowsOf } = await import("@portfolio/kit");
  const { sql } = await import("drizzle-orm");
  const words = [...new Set(q.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])].slice(0, 10);
  const tsq = words.join(" | ");
  return rowsOf<{ id: string }>(
    await db.execute(sql`
      select id from products where active = true
        and (to_tsvector('english', name || ' ' || category || ' ' || description) @@ to_tsquery('english', ${tsq}) or name ilike ${"%" + q + "%"})
      order by ts_rank_cd(to_tsvector('english', name || ' ' || category || ' ' || description), to_tsquery('english', ${tsq})) desc limit 60`),
  ).map((r) => r.id);
}

async function semanticOnly(q: string): Promise<string[]> {
  const { rowsOf } = await import("@portfolio/kit");
  const { sql } = await import("drizzle-orm");
  const [vec] = await getAI().embed({ feature: "eval_search", texts: [q] });
  const literal = `[${vec!.join(",")}]`;
  return rowsOf<{ id: string }>(await db.execute(sql`select id from products where active = true and embedding is not null order by embedding <=> ${literal}::vector limit 60`)).map((r) => r.id);
}

main()
  .then(() => dbHandle().close())
  .catch(async (err) => {
    console.error(err);
    await dbHandle().close();
    process.exit(1);
  });
