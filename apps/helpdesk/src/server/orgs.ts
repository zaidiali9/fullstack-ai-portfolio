import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { conflict, HttpError, notFound as notFoundError } from "@portfolio/kit";
import { db, schema } from "@/db";
import type { Role } from "@db/schema";
import { env } from "@/lib/env";
import { audit } from "./audit";
import type { OrgContext } from "./authz";
import { queueEmails } from "./email";

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "At least 3 characters")
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes");

export const createOrgInput = z.object({ name: z.string().trim().min(2).max(80), slug: slugSchema });
export const inviteInput = z.object({ email: z.email().trim().toLowerCase(), role: z.enum(["admin", "agent", "customer"]) });
export const roleInput = z.object({ membershipId: z.uuid(), role: z.enum(["admin", "agent", "customer"]) });
export const settingsInput = z.object({ name: z.string().trim().min(2).max(80), allowCustomerSignup: z.coerce.boolean() });

export async function listMyOrgs(userId: string) {
  return db
    .select({ slug: schema.organizations.slug, name: schema.organizations.name, role: schema.memberships.role, plan: schema.organizations.plan })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.memberships.orgId, schema.organizations.id))
    .where(eq(schema.memberships.userId, userId))
    .orderBy(asc(schema.organizations.name));
}

export async function createOrg(user: { id: string }, input: z.infer<typeof createOrgInput>) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.slug, input.slug)).limit(1);
    if (existing) throw conflict("That URL is already taken. Try another.");
    const [org] = await tx.insert(schema.organizations).values({ name: input.name, slug: input.slug }).returning();
    await tx.insert(schema.memberships).values({ orgId: org!.id, userId: user.id, role: "admin" });
    await audit(tx, { orgId: org!.id, actorId: user.id, action: "org.created", targetType: "organization", targetId: org!.id });
    return org!;
  });
}

/** Self-serve customer signup for orgs that allow it (public support portal). */
export async function joinAsCustomer(user: { id: string }, slug: string) {
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, slug)).limit(1);
  if (!org || !org.allowCustomerSignup) throw notFoundError("Support portal");
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.memberships)
      .values({ orgId: org.id, userId: user.id, role: "customer" })
      .onConflictDoNothing()
      .returning({ id: schema.memberships.id });
    if (inserted.length) await audit(tx, { orgId: org.id, actorId: user.id, action: "member.joined", targetType: "user", targetId: user.id, meta: { role: "customer" } });
  });
  return org;
}

export async function getPublicOrg(slug: string) {
  const [org] = await db
    .select({ name: schema.organizations.name, slug: schema.organizations.slug, allowCustomerSignup: schema.organizations.allowCustomerSignup })
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, slug))
    .limit(1);
  return org ?? null;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function inviteMember(ctx: OrgContext, input: z.infer<typeof inviteInput>) {
  const token = randomBytes(24).toString("base64url");
  const link = `${env().APP_URL}/invite/${token}`;
  return db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(schema.invitations)
      .values({ orgId: ctx.org.id, email: input.email, role: input.role, tokenHash: hashToken(token), invitedById: ctx.user.id, expiresAt: new Date(Date.now() + 7 * 86400_000) })
      .returning();
    await audit(tx, { orgId: ctx.org.id, actorId: ctx.user.id, action: "member.invited", targetType: "invitation", targetId: inv!.id, meta: { email: input.email, role: input.role } });
    const emailIds = await queueEmails(tx, ctx.org.id, [
      { to: input.email, subject: `You're invited to ${ctx.org.name} on Tidal Desk`, text: `${ctx.user.name} invited you to join ${ctx.org.name} as ${input.role}.\n\nAccept: ${link}\n\nThis link expires in 7 days.` },
    ]);
    return { invitation: inv!, link, emailIds };
  });
}

export async function acceptInvite(user: { id: string; email: string }, token: string) {
  const [inv] = await db
    .select({ inv: schema.invitations, slug: schema.organizations.slug })
    .from(schema.invitations)
    .innerJoin(schema.organizations, eq(schema.invitations.orgId, schema.organizations.id))
    .where(and(eq(schema.invitations.tokenHash, hashToken(token)), isNull(schema.invitations.acceptedAt), gt(schema.invitations.expiresAt, new Date())))
    .limit(1);
  if (!inv) throw new HttpError(404, "invalid_invite", "This invitation is invalid or has expired.");
  if (inv.inv.email.toLowerCase() !== user.email.toLowerCase())
    throw new HttpError(403, "wrong_account", `This invitation was sent to ${inv.inv.email}. Sign in with that email to accept it.`);
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.memberships)
      .values({ orgId: inv.inv.orgId, userId: user.id, role: inv.inv.role })
      .onConflictDoUpdate({ target: [schema.memberships.orgId, schema.memberships.userId], set: { role: inv.inv.role } });
    await tx.update(schema.invitations).set({ acceptedAt: new Date() }).where(eq(schema.invitations.id, inv.inv.id));
    await audit(tx, { orgId: inv.inv.orgId, actorId: user.id, action: "member.joined", targetType: "user", targetId: user.id, meta: { role: inv.inv.role, via: "invitation" } });
  });
  return inv.slug;
}

export async function listMembers(orgId: string) {
  return db
    .select({ membershipId: schema.memberships.id, userId: schema.user.id, name: schema.user.name, email: schema.user.email, role: schema.memberships.role, joinedAt: schema.memberships.createdAt })
    .from(schema.memberships)
    .innerJoin(schema.user, eq(schema.memberships.userId, schema.user.id))
    .where(eq(schema.memberships.orgId, orgId))
    .orderBy(asc(schema.memberships.role), asc(schema.user.name));
}

export async function listPendingInvites(orgId: string) {
  return db
    .select({ id: schema.invitations.id, email: schema.invitations.email, role: schema.invitations.role, expiresAt: schema.invitations.expiresAt })
    .from(schema.invitations)
    .where(and(eq(schema.invitations.orgId, orgId), isNull(schema.invitations.acceptedAt), gt(schema.invitations.expiresAt, new Date())))
    .orderBy(desc(schema.invitations.createdAt));
}

async function adminCount(orgId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.role, "admin")));
  return r?.n ?? 0;
}

export async function changeRole(ctx: OrgContext, membershipId: string, role: Role) {
  const [m] = await db
    .select()
    .from(schema.memberships)
    .where(and(eq(schema.memberships.id, membershipId), eq(schema.memberships.orgId, ctx.org.id)))
    .limit(1);
  if (!m) throw notFoundError("Member");
  if (m.role === "admin" && role !== "admin" && (await adminCount(ctx.org.id)) <= 1)
    throw new HttpError(400, "last_admin", "An organization needs at least one admin.");
  await db.transaction(async (tx) => {
    await tx.update(schema.memberships).set({ role }).where(eq(schema.memberships.id, m.id));
    await audit(tx, { orgId: ctx.org.id, actorId: ctx.user.id, action: "member.role_changed", targetType: "user", targetId: m.userId, meta: { from: m.role, to: role } });
  });
}

export async function removeMember(ctx: OrgContext, membershipId: string) {
  const [m] = await db
    .select()
    .from(schema.memberships)
    .where(and(eq(schema.memberships.id, membershipId), eq(schema.memberships.orgId, ctx.org.id)))
    .limit(1);
  if (!m) throw notFoundError("Member");
  if (m.role === "admin" && (await adminCount(ctx.org.id)) <= 1) throw new HttpError(400, "last_admin", "An organization needs at least one admin.");
  await db.transaction(async (tx) => {
    await tx.delete(schema.memberships).where(eq(schema.memberships.id, m.id));
    await tx.update(schema.tickets).set({ assigneeId: null }).where(and(eq(schema.tickets.orgId, ctx.org.id), eq(schema.tickets.assigneeId, m.userId)));
    await audit(tx, { orgId: ctx.org.id, actorId: ctx.user.id, action: "member.removed", targetType: "user", targetId: m.userId, meta: { role: m.role } });
  });
}

export async function updateSettings(ctx: OrgContext, input: z.infer<typeof settingsInput>) {
  await db.transaction(async (tx) => {
    await tx.update(schema.organizations).set(input).where(eq(schema.organizations.id, ctx.org.id));
    await audit(tx, { orgId: ctx.org.id, actorId: ctx.user.id, action: "org.settings_updated", targetType: "organization", targetId: ctx.org.id, meta: input });
  });
}
