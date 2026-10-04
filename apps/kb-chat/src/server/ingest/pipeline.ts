import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { HttpError, rowsOf } from "@portfolio/kit";
import { db, schema } from "@/db";
import { getAI } from "@/lib/ai";
import { chunkPages } from "./chunk";
import { extractText } from "./extract";

export const MAX_CHUNKS_PER_DOCUMENT = 2000;

/** Turn a stored upload into searchable chunks: extract -> chunk -> embed -> replace chunks atomically. */
export async function processDocument(documentId: string): Promise<{ chunks: number }> {
  const [row] = await db
    .select({ doc: schema.documents, data: schema.documentBlobs.data })
    .from(schema.documents)
    .innerJoin(schema.documentBlobs, eq(schema.documentBlobs.documentId, schema.documents.id))
    .where(eq(schema.documents.id, documentId))
    .limit(1);
  if (!row) throw new HttpError(404, "missing_blob", "The uploaded file is no longer available.");
  const { doc, data } = row;

  await db.update(schema.documents).set({ status: "processing", error: null }).where(eq(schema.documents.id, doc.id));
  const extracted = await extractText(data, doc.mimeType);
  const pieces = chunkPages(extracted.pages);
  if (pieces.length === 0) throw new HttpError(422, "no_text", "No readable text was found (scanned PDFs need OCR, which isn't supported yet).");
  if (pieces.length > MAX_CHUNKS_PER_DOCUMENT) throw new HttpError(413, "too_long", "This document is too long to index.");

  // Embeddings are optional: without a provider the document is still searchable by keywords.
  const ai = getAI({ workspaceId: doc.workspaceId });
  const vectors = ai.status().embeddings.available ? await ai.embed({ feature: "ingest", texts: pieces.map((p) => p.content) }) : null;

  await db.transaction(async (tx) => {
    await tx.delete(schema.chunks).where(eq(schema.chunks.documentId, doc.id));
    for (let i = 0; i < pieces.length; i += 200) {
      await tx.insert(schema.chunks).values(
        pieces.slice(i, i + 200).map((p, j) => ({
          documentId: doc.id,
          workspaceId: doc.workspaceId,
          ordinal: i + j,
          content: p.content,
          page: p.page,
          heading: p.heading,
          embedding: vectors ? vectors[i + j]! : null,
        })),
      );
    }
    await tx
      .update(schema.documents)
      .set({
        status: "ready",
        chunkCount: pieces.length,
        pageCount: extracted.pageCount,
        error: null,
        ...(doc.sourceType === "url" && extracted.title && doc.title === doc.sourceUrl ? { title: extracted.title } : {}),
      })
      .where(eq(schema.documents.id, doc.id));
    // The raw upload is no longer needed once indexed.
    await tx.delete(schema.documentBlobs).where(eq(schema.documentBlobs.documentId, doc.id));
  });
  return { chunks: pieces.length };
}

const MAX_ATTEMPTS = 3;
const STALE_LOCK = sql`now() - interval '10 minutes'`;

/** Atomically claim the next runnable job (FOR UPDATE SKIP LOCKED: safe with concurrent workers). */
export async function claimNextJob(): Promise<{ id: string; documentId: string; attempts: number } | null> {
  const rows = rowsOf<{ id: string; document_id: string; attempts: number }>(
    await db.execute(sql`
      update ingestion_jobs set status = 'processing', locked_at = now(), attempts = attempts + 1, updated_at = now()
      where id = (
        select id from ingestion_jobs
        where (status = 'queued' and run_after <= now())
           or (status = 'processing' and locked_at < ${STALE_LOCK})
        order by run_after
        for update skip locked
        limit 1
      )
      returning id, document_id, attempts`),
  );
  const r = rows[0];
  return r ? { id: r.id, documentId: r.document_id, attempts: Number(r.attempts) } : null;
}

/** Process queued jobs until the queue is empty or the time budget is used up. */
export async function runJobs(opts: { timeBudgetMs?: number; max?: number } = {}): Promise<{ processed: number; failed: number }> {
  const deadline = Date.now() + (opts.timeBudgetMs ?? 50_000);
  let processed = 0;
  let failed = 0;
  while (Date.now() < deadline && processed + failed < (opts.max ?? 50)) {
    const job = await claimNextJob();
    if (!job) break;
    try {
      await processDocument(job.documentId);
      await db.update(schema.ingestionJobs).set({ status: "done", lockedAt: null, lastError: null }).where(eq(schema.ingestionJobs.id, job.id));
      processed++;
    } catch (err) {
      const message = err instanceof HttpError ? err.message : "Processing failed. Please try again or upload a different file.";
      if (!(err instanceof HttpError)) console.error(`[ingest] job ${job.id} failed`, err);
      // Permanent errors (bad file) fail immediately; transient ones retry with backoff.
      const permanent = err instanceof HttpError && err.status < 500;
      const giveUp = permanent || job.attempts >= MAX_ATTEMPTS;
      await db.transaction(async (tx) => {
        await tx
          .update(schema.ingestionJobs)
          .set({
            status: giveUp ? "failed" : "queued",
            lockedAt: null,
            lastError: message,
            runAfter: giveUp ? undefined : sql`now() + make_interval(secs => ${30 * 2 ** job.attempts})`,
          })
          .where(eq(schema.ingestionJobs.id, job.id));
        await tx
          .update(schema.documents)
          .set({ status: giveUp ? "failed" : "queued", error: giveUp ? message : null })
          .where(and(eq(schema.documents.id, job.documentId)));
      });
      failed++;
    }
  }
  return { processed, failed };
}
