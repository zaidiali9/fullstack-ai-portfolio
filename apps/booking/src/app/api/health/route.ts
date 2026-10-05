import { sql } from "drizzle-orm";
import { db } from "@/db";
import { aiStatus } from "@/lib/ai";

export const dynamic = "force-dynamic";

/** Liveness + dependency check for uptime monitors and docker-compose healthchecks. */
export async function GET() {
  let database = "ok";
  try {
    await db.execute(sql`select 1`);
  } catch {
    database = "error";
  }
  return Response.json(
    { status: database === "ok" ? "ok" : "degraded", database, ai: { chat: aiStatus()?.provider ?? "unavailable" } },
    { status: database === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
