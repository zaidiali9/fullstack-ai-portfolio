import { randomUUID } from "node:crypto";
import { db, schema } from "@/db";
import type { Role } from "@db/schema";
import type { OrgContext } from "@/server/authz";

export async function makeUser(name = "Test User") {
  const id = randomUUID();
  const [u] = await db
    .insert(schema.user)
    .values({ id, name, email: `${id.slice(0, 8)}@test.demo`, emailVerified: true })
    .returning();
  return u!;
}

export async function makeOrg(slug = `org-${randomUUID().slice(0, 8)}`, plan: "free" | "pro" = "free") {
  const [o] = await db.insert(schema.organizations).values({ name: `Org ${slug}`, slug, plan }).returning();
  return o!;
}

export async function addMember(orgId: string, userId: string, role: Role) {
  await db.insert(schema.memberships).values({ orgId, userId, role });
}

/** Build the same context requireOrg() produces, for calling services directly. */
export async function ctxFor(org: typeof schema.organizations.$inferSelect, role: Role, name?: string): Promise<OrgContext> {
  const user = await makeUser(name ?? `${role} user`);
  await addMember(org.id, user.id, role);
  return { user, org, role };
}

/** A tenant with an admin, an agent and two customers. */
export async function tenant(plan: "free" | "pro" = "free") {
  const org = await makeOrg(undefined, plan);
  return {
    org,
    admin: await ctxFor(org, "admin", "Ada Admin"),
    agent: await ctxFor(org, "agent", "Alex Agent"),
    customer: await ctxFor(org, "customer", "Casey Customer"),
    other: await ctxFor(org, "customer", "Olive Other"),
  };
}
