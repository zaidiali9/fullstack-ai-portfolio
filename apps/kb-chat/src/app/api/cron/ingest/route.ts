import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runJobs } from "@/server/ingest/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Drains the ingestion queue. Call from a scheduler (e.g. Vercel Cron every 5 minutes) with
 * `Authorization: Bearer $CRON_SECRET`. Picks up retries and anything `after()` didn't finish.
 */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok = !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return Response.json({ error: { code: "unauthorized", message: "Unauthorized" } }, { status: 401 });
  const result = await runJobs({ timeBudgetMs: 240_000 });
  return Response.json(result);
}
