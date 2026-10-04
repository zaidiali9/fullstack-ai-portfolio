import "server-only";
import { createHash } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { conflict, HttpError, notFound as notFoundError } from "@portfolio/kit";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import type { WsContext } from "./authz";
import { fetchPublicPage } from "./ingest/url";
import { detectFileType, safeFileName, titleFromFileName } from "./ingest/validate";

export const urlInput = z.object({ url: z.string().trim().min(8).max(2000) });

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function enforceDocLimit(ctx: WsContext) {
  const [r] = await db.select({ n: count() }).from(schema.documents).where(eq(schema.documents.workspaceId, ctx.ws.id));
  if ((r?.n ?? 0) >= ctx.ws.maxDocuments) throw new HttpError(403, "document_limit", `This workspace has reached its limit of ${ctx.ws.maxDocuments} documents.`);
}

/** Store the upload + a queued ingestion job in one transaction. Processing happens in the background. */
async function createDocument(
  ctx: WsContext,
  input: { title: string; sourceType: "file" | "url"; fileName?: string; sourceUrl?: string; mimeType: string; data: Buffer },
) {
  await enforceDocLimit(ctx);
  const hash = sha256(input.data);
  const [dupe] = await db
    .select({ id: schema.documents.id, title: schema.documents.title })
    .from(schema.documents)
    .where(and(eq(schema.documents.workspaceId, ctx.ws.id), eq(schema.documents.contentHash, hash)))
    .limit(1);
  if (dupe) throw conflict(`This content is already in the workspace as "${dupe.title}".`);
  return db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(schema.documents)
      .values({
        workspaceId: ctx.ws.id,
        title: input.title,
        sourceType: input.sourceType,
        fileName: input.fileName ?? null,
        sourceUrl: input.sourceUrl ?? null,
        mimeType: input.mimeType,
        sizeBytes: input.data.length,
        contentHash: hash,
        createdById: ctx.user.id,
      })
      .returning();
    await tx.insert(schema.documentBlobs).values({ documentId: doc!.id, data: input.data });
    await tx.insert(schema.ingestionJobs).values({ documentId: doc!.id, workspaceId: ctx.ws.id });
    return doc!;
  });
}

export async function uploadFile(ctx: WsContext, file: File) {
  const data = Buffer.from(await file.arrayBuffer());
  const name = safeFileName(file.name);
  const mimeType = detectFileType(name, data, env().MAX_UPLOAD_MB * 1024 * 1024);
  return createDocument(ctx, { title: titleFromFileName(name), sourceType: "file", fileName: name, mimeType, data });
}

export async function addUrl(ctx: WsContext, rawUrl: string) {
  const page = await fetchPublicPage(rawUrl, { allowPrivate: env().ALLOW_PRIVATE_URLS });
  return createDocument(ctx, { title: page.url, sourceType: "url", sourceUrl: page.url, mimeType: page.mimeType, data: page.body });
}

export async function listDocuments(workspaceId: string) {
  return db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      sourceType: schema.documents.sourceType,
      fileName: schema.documents.fileName,
      sourceUrl: schema.documents.sourceUrl,
      mimeType: schema.documents.mimeType,
      sizeBytes: schema.documents.sizeBytes,
      status: schema.documents.status,
      error: schema.documents.error,
      pageCount: schema.documents.pageCount,
      chunkCount: schema.documents.chunkCount,
      createdAt: schema.documents.createdAt,
    })
    .from(schema.documents)
    .where(eq(schema.documents.workspaceId, workspaceId))
    .orderBy(desc(schema.documents.createdAt))
    .limit(200);
}

export async function getDocument(ctx: WsContext, id: string) {
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.id, id), eq(schema.documents.workspaceId, ctx.ws.id)))
    .limit(1);
  if (!doc) throw notFoundError("Document");
  const preview = await db
    .select({ id: schema.chunks.id, ordinal: schema.chunks.ordinal, content: schema.chunks.content, page: schema.chunks.page })
    .from(schema.chunks)
    .where(eq(schema.chunks.documentId, id))
    .orderBy(schema.chunks.ordinal)
    .limit(30);
  return { doc, preview };
}

export async function getChunk(ctx: WsContext, chunkId: string) {
  const [c] = await db
    .select({ id: schema.chunks.id, content: schema.chunks.content, page: schema.chunks.page, documentId: schema.chunks.documentId, title: schema.documents.title })
    .from(schema.chunks)
    .innerJoin(schema.documents, eq(schema.documents.id, schema.chunks.documentId))
    .where(and(eq(schema.chunks.id, chunkId), eq(schema.chunks.workspaceId, ctx.ws.id)))
    .limit(1);
  if (!c) throw notFoundError("Source");
  return c;
}

export async function deleteDocument(ctx: WsContext, id: string) {
  const deleted = await db
    .delete(schema.documents)
    .where(and(eq(schema.documents.id, id), eq(schema.documents.workspaceId, ctx.ws.id)))
    .returning({ id: schema.documents.id });
  if (!deleted.length) throw notFoundError("Document");
}

/** Re-queue a failed document (only possible while its upload is still stored). */
export async function retryDocument(ctx: WsContext, id: string) {
  const [blob] = await db
    .select({ id: schema.documentBlobs.documentId })
    .from(schema.documentBlobs)
    .innerJoin(schema.documents, eq(schema.documents.id, schema.documentBlobs.documentId))
    .where(and(eq(schema.documents.id, id), eq(schema.documents.workspaceId, ctx.ws.id)))
    .limit(1);
  if (!blob) throw new HttpError(400, "cannot_retry", "This document can't be retried. Delete it and upload it again.");
  await db.transaction(async (tx) => {
    await tx.update(schema.documents).set({ status: "queued", error: null }).where(eq(schema.documents.id, id));
    await tx.insert(schema.ingestionJobs).values({ documentId: id, workspaceId: ctx.ws.id });
  });
}
