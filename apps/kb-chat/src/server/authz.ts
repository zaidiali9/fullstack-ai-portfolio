import "server-only";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";
import { forbidden, notFound as notFoundError } from "@portfolio/kit";
import { db, schema } from "@/db";
import type { Workspace, WorkspaceRole } from "@db/schema";
import { can, type Permission } from "./permissions";
import { requireUser, requireUserApi } from "./session";

export interface WsContext {
  user: { id: string; name: string; email: string };
  ws: Workspace;
  role: WorkspaceRole;
}

/** One query: workspace + caller's membership. Non-members get null (existence is not revealed). */
export const loadMembership = cache(async (userId: string, slug: string) => {
  const [row] = await db
    .select({ ws: schema.workspaces, role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaceMembers.workspaceId, schema.workspaces.id))
    .where(and(eq(schema.workspaceMembers.userId, userId), eq(schema.workspaces.slug, slug)))
    .limit(1);
  return row ?? null;
});

/** Server actions: redirect when signed out, 404 when not a member, 403 when lacking permission. */
export async function requireWs(slug: string, permission?: Permission): Promise<WsContext> {
  const user = await requireUser();
  const m = await loadMembership(user.id, slug);
  if (!m) notFound();
  if (permission && !can(m.role, permission)) throw forbidden();
  return { user, ws: m.ws, role: m.role };
}

/** Pages: a missing permission renders 404 instead of an error. */
export async function requireWsPage(slug: string, permission?: Permission): Promise<WsContext> {
  const ctx = await requireWs(slug);
  if (permission && !can(ctx.role, permission)) notFound();
  return ctx;
}

/** Route handlers: 401 / 404 / 403 as HttpErrors. */
export async function requireWsApi(slug: string, permission?: Permission): Promise<WsContext> {
  const user = await requireUserApi();
  const m = await loadMembership(user.id, slug);
  if (!m) throw notFoundError("Workspace");
  if (permission && !can(m.role, permission)) throw forbidden();
  return { user, ws: m.ws, role: m.role };
}
