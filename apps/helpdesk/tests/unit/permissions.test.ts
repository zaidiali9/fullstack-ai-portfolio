import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, type Permission } from "@/server/permissions";

describe("RBAC matrix", () => {
  it.each<[Permission, boolean, boolean, boolean]>([
    // permission, admin, agent, customer
    ["ticket:create", true, true, true],
    ["ticket:read:all", true, true, false],
    ["ticket:update", true, true, false],
    ["ticket:note", true, true, false],
    ["ai:use", true, true, false],
    ["kb:write", true, true, false],
    ["kb:read:drafts", true, true, false],
    ["members:manage", true, false, false],
    ["billing:manage", true, false, false],
    ["audit:read", true, false, false],
    ["emails:read", true, false, false],
  ])("%s -> admin:%s agent:%s customer:%s", (perm, admin, agent, customer) => {
    expect([can("admin", perm), can("agent", perm), can("customer", perm)]).toEqual([admin, agent, customer]);
  });

  it("customers never get AI or management permissions", () => {
    const customerPerms = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can("customer", p));
    expect(customerPerms.sort()).toEqual(["kb:read", "ticket:create", "ticket:reply"]);
  });
});
