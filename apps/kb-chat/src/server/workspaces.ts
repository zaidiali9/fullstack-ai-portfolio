import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, count, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { conflict, HttpError, notFound as notFoundError } from "@portfolio/kit";
import { db, schema } from "@/db";
import type { WorkspaceRole } from "@db/schema";
import type { WsContext } from "./authz";

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "At least 3 characters")
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes");

export const createWsInput = z.object({ name: z.string().trim().min(2).max(80), slug: slugSchema });
export const addMemberInput = z.object({ email: z.email().trim().toLowerCase(), role: z.enum(["owner", "editor", "viewer"]) });
export const roleInput = z.object({ memberId: z.uuid(), role: z.enum(["owner", "editor", "viewer"]) });

const originSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/\/+$/, ""))
  .pipe(z.url({ protocol: /^https?$/ }).refine((u) => new URL(u).pathname === "/" || !new URL(u).pathname.slice(1), "Use an origin like https://example.com (no path)"));

export const widgetInput = z.object({
  widgetEnabled: z.boolean(),
  widgetGreeting: z.string().trim().min(2).max(200),
  widgetAllowedOrigins: z.array(originSchema).max(10),
});

export const newWidgetKey = () => `wk_${randomBytes(12).toString("base64url")}`;

export async function listMyWorkspaces(userId: string) {
  return db
    .select({ slug: schema.workspaces.slug, name: schema.workspaces.name, role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaceMembers.workspaceId, schema.workspaces.id))
    .where(eq(schema.workspaceMembers.userId, userId))
    .orderBy(asc(schema.workspaces.name));
}

export async function createWorkspace(user: { id: string }, input: z.infer<typeof createWsInput>) {
  return db.transaction(async (tx) => {
    const [taken] = await tx.select({ id: schema.workspaces.id }).from(schema.workspaces).where(eq(schema.workspaces.slug, input.slug)).limit(1);
    if (taken) throw conflict("That URL is already taken. Try another.");
    const [ws] = await tx.insert(schema.workspaces).values({ ...input, widgetKey: newWidgetKey() }).returning();
    await tx.insert(schema.workspaceMembers).values({ workspaceId: ws!.id, userId: user.id, role: "owner" });
    return ws!;
  });
}

export async function listMembers(workspaceId: string) {
  return db
    .select({ memberId: schema.workspaceMembers.id, userId: schema.user.id, name: schema.user.name, email: schema.user.email, role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .innerJoin(schema.user, eq(schema.workspaceMembers.userId, schema.user.id))
    .where(eq(schema.workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(schema.user.name));
}

/** Add an existing account to the workspace (the person must have signed up first). */
export async function addMember(ctx: WsContext, input: z.infer<typeof addMemberInput>) {
  const [u] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, input.email)).limit(1);
  if (!u) throw new HttpError(404, "no_account", "No account uses that email yet. Ask them to sign up first.");
  const inserted = await db
    .insert(schema.workspaceMembers)
    .values({ workspaceId: ctx.ws.id, userId: u.id, role: input.role })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length) throw conflict("That person is already a member.");
}

async function ownerCount(workspaceId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.role, "owner")));
  return r?.n ?? 0;
}

export async function changeRole(ctx: WsContext, memberId: string, role: WorkspaceRole) {
  const [m] = await db
    .select()
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.id, memberId), eq(schema.workspaceMembers.workspaceId, ctx.ws.id)))
    .limit(1);
  if (!m) throw notFoundError("Member");
  if (m.role === "owner" && role !== "owner" && (await ownerCount(ctx.ws.id)) <= 1) throw new HttpError(400, "last_owner", "A workspace needs at least one owner.");
  await db.update(schema.workspaceMembers).set({ role }).where(eq(schema.workspaceMembers.id, m.id));
}

export async function removeMember(ctx: WsContext, memberId: string) {
  const [m] = await db
    .select()
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.id, memberId), eq(schema.workspaceMembers.workspaceId, ctx.ws.id)))
    .limit(1);
  if (!m) throw notFoundError("Member");
  if (m.role === "owner" && (await ownerCount(ctx.ws.id)) <= 1) throw new HttpError(400, "last_owner", "A workspace needs at least one owner.");
  await db.delete(schema.workspaceMembers).where(eq(schema.workspaceMembers.id, m.id));
}

export async function updateWidget(ctx: WsContext, input: z.infer<typeof widgetInput>) {
  await db.update(schema.workspaces).set(input).where(eq(schema.workspaces.id, ctx.ws.id));
}

export async function rotateWidgetKey(ctx: WsContext) {
  await db.update(schema.workspaces).set({ widgetKey: newWidgetKey() }).where(eq(schema.workspaces.id, ctx.ws.id));
}

export async function usageStats(workspaceId: string) {
  const since = sql`date_trunc('month', now())`;
  const [docs, chunks, byFeature] = await Promise.all([
    db.select({ n: count() }).from(schema.documents).where(eq(schema.documents.workspaceId, workspaceId)),
    db.select({ n: count() }).from(schema.chunks).where(eq(schema.chunks.workspaceId, workspaceId)),
    db
      .select({
        feature: schema.aiUsage.feature,
        calls: count(),
        avgMs: sql<number>`round(avg(${schema.aiUsage.latencyMs}))`,
        failures: sql<number>`sum(1 - ${schema.aiUsage.ok})`,
        outputTokens: sql<number>`coalesce(sum(${schema.aiUsage.outputTokens}), 0)`,
      })
      .from(schema.aiUsage)
      .where(and(eq(schema.aiUsage.scope, workspaceId), gte(schema.aiUsage.createdAt, since)))
      .groupBy(schema.aiUsage.feature),
  ]);
  return {
    documents: docs[0]?.n ?? 0,
    chunks: chunks[0]?.n ?? 0,
    byFeature: byFeature.map((r) => ({ ...r, avgMs: Number(r.avgMs), failures: Number(r.failures), outputTokens: Number(r.outputTokens) })),
  };
}

/** Widget lookup by public key. Returns null when the key is unknown or the widget is disabled. */
export async function getWidgetWorkspace(key: string) {
  if (!/^wk_[A-Za-z0-9_-]{16}$/.test(key)) return null;
  const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.widgetKey, key)).limit(1);
  return ws && ws.widgetEnabled ? ws : null;
}

/**
 * The widget page is only served inside allowlisted sites. The embedding page's origin comes from
 * the Referer header of the iframe request (browsers send at least the origin cross-site).
 */
export function embedAllowed(allowedOrigins: string[], referer: string | null, appOrigin: string): boolean {
  if (!referer) return false;
  let origin: string;
  try {
    origin = new URL(referer).origin;
  } catch {
    return false;
  }
  if (origin === appOrigin) return true; // preview inside the app's own settings page
  return allowedOrigins.includes(origin);
}
