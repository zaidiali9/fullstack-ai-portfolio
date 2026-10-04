import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { acceptInvite, changeRole, createOrg, createOrgInput, inviteMember, joinAsCustomer, listMembers, removeMember } from "@/server/orgs";
import { makeUser, tenant } from "./factories";

describe("organizations, invitations and roles (PGlite integration)", () => {
  it("validates slugs and refuses duplicates", async () => {
    expect(createOrgInput.safeParse({ name: "Acme", slug: "Bad Slug!" }).success).toBe(false);
    const u = await makeUser();
    const org = await createOrg(u, { name: "Acme", slug: "acme-test" });
    const members = await listMembers(org.id);
    expect(members).toMatchObject([{ userId: u.id, role: "admin" }]);
    await expect(createOrg(u, { name: "Acme 2", slug: "acme-test" })).rejects.toMatchObject({ status: 409 });
  });

  it("invitation tokens are hashed, single-use and bound to the invited email", async () => {
    const t = await tenant();
    const invitee = await makeUser("Invitee");
    const { link, invitation } = await inviteMember(t.admin, { email: invitee.email, role: "agent" });
    const token = link.split("/invite/")[1]!;
    expect(invitation.tokenHash).not.toContain(token);
    const stranger = await makeUser("Stranger");
    await expect(acceptInvite(stranger, token)).rejects.toMatchObject({ status: 403 });
    expect(await acceptInvite(invitee, token)).toBe(t.org.slug);
    await expect(acceptInvite(invitee, token)).rejects.toMatchObject({ status: 404 }); // already used
    const [m] = await db.select().from(schema.memberships).where(and(eq(schema.memberships.orgId, t.org.id), eq(schema.memberships.userId, invitee.id)));
    expect(m!.role).toBe("agent");
  });

  it("expired invitations are rejected", async () => {
    const t = await tenant();
    const invitee = await makeUser();
    const { link, invitation } = await inviteMember(t.admin, { email: invitee.email, role: "customer" });
    await db.update(schema.invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.invitations.id, invitation.id));
    await expect(acceptInvite(invitee, link.split("/invite/")[1]!)).rejects.toMatchObject({ status: 404 });
  });

  it("never removes or demotes the last admin", async () => {
    const t = await tenant();
    const members = await listMembers(t.org.id);
    const admin = members.find((m) => m.role === "admin")!;
    await expect(changeRole(t.admin, admin.membershipId, "agent")).rejects.toMatchObject({ status: 400 });
    await expect(removeMember(t.admin, admin.membershipId)).rejects.toMatchObject({ status: 400 });
    const agent = members.find((m) => m.role === "agent")!;
    await changeRole(t.admin, agent.membershipId, "admin");
    await changeRole(t.admin, admin.membershipId, "agent"); // now allowed: another admin exists
  });

  it("self-serve customer join respects the portal setting", async () => {
    const t = await tenant();
    const u = await makeUser();
    await joinAsCustomer(u, t.org.slug);
    await joinAsCustomer(u, t.org.slug); // idempotent
    expect((await listMembers(t.org.id)).filter((m) => m.userId === u.id)).toMatchObject([{ role: "customer" }]);
    await db.update(schema.organizations).set({ allowCustomerSignup: false }).where(eq(schema.organizations.id, t.org.id));
    await expect(joinAsCustomer(await makeUser(), t.org.slug)).rejects.toMatchObject({ status: 404 });
  });
});
