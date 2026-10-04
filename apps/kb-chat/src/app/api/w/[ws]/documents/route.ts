import { after } from "next/server";
import { assertSameOrigin, enforceRateLimit, HttpError, route } from "@portfolio/kit";
import { db } from "@/db";
import { requireWsApi } from "@/server/authz";
import { listDocuments, uploadFile } from "@/server/documents";
import { runJobs } from "@/server/ingest/pipeline";

/** GET: documents with ingestion status (polled by the documents page while processing). */
export const GET = route(async (_req: Request, { params }: RouteContext<"/api/w/[ws]/documents">) => {
  const { ws } = await params;
  const ctx = await requireWsApi(ws, "docs:read");
  return Response.json({ documents: await listDocuments(ctx.ws.id) }, { headers: { "cache-control": "private, no-store" } });
});

/** POST multipart/form-data with one or more `file` fields. Validated, stored and queued for ingestion. */
export const POST = route(async (req: Request, { params }: RouteContext<"/api/w/[ws]/documents">) => {
  assertSameOrigin(req);
  const { ws } = await params;
  const ctx = await requireWsApi(ws, "docs:write");
  await enforceRateLimit(db, `upload:${ctx.user.id}`, { limit: 20, windowMs: 60_000, message: "Too many uploads at once. Please wait a minute." });
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "invalid_form", "Send files as multipart/form-data.");
  });
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new HttpError(400, "no_file", "Choose at least one file.");
  if (files.length > 10) throw new HttpError(400, "too_many_files", "Upload at most 10 files at a time.");
  const results = [];
  for (const file of files) {
    try {
      const doc = await uploadFile(ctx, file);
      results.push({ name: file.name, ok: true as const, id: doc.id });
    } catch (err) {
      results.push({ name: file.name, ok: false as const, error: err instanceof HttpError ? err.message : "Upload failed." });
      if (!(err instanceof HttpError)) console.error("[upload]", err);
    }
  }
  // Ingestion runs after the response; a cron job (/api/cron/ingest) picks up anything left over.
  if (results.some((r) => r.ok)) after(() => runJobs({ timeBudgetMs: 240_000 }));
  return Response.json({ results }, { status: results.some((r) => r.ok) ? 202 : 400 });
});
