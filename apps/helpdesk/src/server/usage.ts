import "server-only";
import { and, avg, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import { db, schema } from "@/db";
import { aiCallsToday, dailyLimit } from "./ai/quota";
import type { OrgContext } from "./authz";

/** AI usage for the settings page: today's quota plus a 30-day breakdown by feature. */
export async function usageSummary(ctx: OrgContext) {
  const since = sql`now() - interval '30 days'`;
  const [today, byFeature] = await Promise.all([
    aiCallsToday(ctx.org.id),
    db
      .select({
        feature: schema.aiUsage.feature,
        calls: count(),
        failures: sum(sql<number>`1 - ${schema.aiUsage.ok}`),
        avgLatencyMs: avg(schema.aiUsage.latencyMs),
        outputTokens: sum(schema.aiUsage.outputTokens),
      })
      .from(schema.aiUsage)
      .where(and(eq(schema.aiUsage.scope, ctx.org.id), gte(schema.aiUsage.createdAt, since)))
      .groupBy(schema.aiUsage.feature)
      .orderBy(desc(count())),
  ]);
  return {
    today,
    limit: dailyLimit(ctx.org.plan),
    byFeature: byFeature.map((r) => ({
      feature: r.feature,
      calls: r.calls,
      failures: Number(r.failures ?? 0),
      avgLatencyMs: r.avgLatencyMs ? Math.round(Number(r.avgLatencyMs)) : null,
      outputTokens: Number(r.outputTokens ?? 0),
    })),
  };
}

export async function listAudit(ctx: OrgContext, page: number, pageSize = 30) {
  const rows = await db
    .select({
      id: schema.auditEvents.id,
      action: schema.auditEvents.action,
      targetType: schema.auditEvents.targetType,
      meta: schema.auditEvents.meta,
      createdAt: schema.auditEvents.createdAt,
      actorName: schema.user.name,
    })
    .from(schema.auditEvents)
    .leftJoin(schema.user, eq(schema.auditEvents.actorId, schema.user.id))
    .where(eq(schema.auditEvents.orgId, ctx.org.id))
    .orderBy(desc(schema.auditEvents.createdAt))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

export async function listEmails(ctx: OrgContext, limit = 50) {
  return db
    .select()
    .from(schema.emailOutbox)
    .where(eq(schema.emailOutbox.orgId, ctx.org.id))
    .orderBy(desc(schema.emailOutbox.createdAt))
    .limit(limit);
}
