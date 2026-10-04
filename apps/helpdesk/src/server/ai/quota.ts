import "server-only";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { enforceRateLimit, HttpError } from "@portfolio/kit";
import { db, schema } from "@/db";
import type { Organization } from "@db/schema";
import { env } from "@/lib/env";

export function dailyLimit(plan: Organization["plan"]) {
  return plan === "pro" ? env().AI_DAILY_LIMIT_PRO : env().AI_DAILY_LIMIT_FREE;
}

export async function aiCallsToday(orgId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(schema.aiUsage)
    .where(and(eq(schema.aiUsage.scope, orgId), eq(schema.aiUsage.kind, "chat"), gte(schema.aiUsage.createdAt, sql`date_trunc('day', now())`)));
  return row?.n ?? 0;
}

/** Throws 429 when the org's daily plan quota is used up. */
export async function enforceOrgQuota(org: Organization) {
  const used = await aiCallsToday(org.id);
  const limit = dailyLimit(org.plan);
  if (used >= limit) {
    throw new HttpError(429, "ai_quota_exceeded", `Your ${org.plan === "pro" ? "Pro" : "Free"} plan's daily AI limit (${limit} calls) has been reached.${org.plan === "free" ? " Upgrade to Pro for more." : ""}`);
  }
}

/** Per-user burst limit plus per-org daily quota, for interactive AI endpoints. */
export async function enforceAiLimits(userId: string, org: Organization) {
  await enforceRateLimit(db, `ai:user:${userId}`, {
    limit: env().AI_USER_PER_MINUTE,
    windowMs: 60_000,
    message: "You're using AI features too quickly. Please wait a minute.",
  });
  await enforceOrgQuota(org);
}
