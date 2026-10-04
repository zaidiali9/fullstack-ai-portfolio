import "server-only";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";
import { forbidden, notFound as notFoundError } from "@portfolio/kit";
import { db, schema } from "@/db";
import type { Role } from "@db/schema";
import { can, type Permission } from "./permissions";
import { requireUser, requireUserApi } from "./session";

export interface OrgContext {
  user: { id: string; name: string; email: string; image?: string | null };
  org: typeof schema.organizations.$inferSelect;
  role: Role;
}

/** One query: the org plus the caller's membership. Non-members get null (org existence is not revealed). */
export const loadMembership = cache(async (userId: string, orgSlug: string) => {
  const [row] = await db
    .select({ org: schema.organizations, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.memberships.orgId, schema.organizations.id))
    .where(and(eq(schema.memberships.userId, userId), eq(schema.organizations.slug, orgSlug)))
    .limit(1);
  return row ?? null;
});

/** Pages/actions: redirect when signed out, 404 when not a member, 403 when lacking the permission. */
export async function requireOrg(orgSlug: string, permission?: Permission): Promise<OrgContext> {
  const user = await requireUser();
  const m = await loadMembership(user.id, orgSlug);
  if (!m) notFound();
  if (permission && !can(m.role, permission)) throw forbidden();
  return { user, org: m.org, role: m.role };
}

/** Pages: like requireOrg, but a missing permission renders the 404 page instead of throwing a 403 error. */
export async function requireOrgPage(orgSlug: string, permission?: Permission): Promise<OrgContext> {
  const ctx = await requireOrg(orgSlug);
  if (permission && !can(ctx.role, permission)) notFound();
  return ctx;
}

/** Route handlers: 401 / 404 / 403 as HttpErrors. */
export async function requireOrgApi(orgSlug: string, permission?: Permission): Promise<OrgContext> {
  const user = await requireUserApi();
  const m = await loadMembership(user.id, orgSlug);
  if (!m) throw notFoundError("Organization");
  if (permission && !can(m.role, permission)) throw forbidden();
  return { user, org: m.org, role: m.role };
}
