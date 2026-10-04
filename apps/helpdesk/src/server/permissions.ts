import type { Role } from "@db/schema";

/**
 * Role-based access control matrix. Every server action and API route checks one of these.
 * Customers additionally only ever see their own tickets (enforced in queries, see tickets.ts).
 */
export const PERMISSIONS = {
  "ticket:create": ["admin", "agent", "customer"],
  "ticket:read:all": ["admin", "agent"],
  "ticket:update": ["admin", "agent"],
  "ticket:reply": ["admin", "agent", "customer"],
  "ticket:note": ["admin", "agent"],
  "ai:use": ["admin", "agent"],
  "kb:read": ["admin", "agent", "customer"],
  "kb:read:drafts": ["admin", "agent"],
  "kb:write": ["admin", "agent"],
  "members:manage": ["admin"],
  "billing:manage": ["admin"],
  "audit:read": ["admin"],
  "emails:read": ["admin"],
  "org:settings": ["admin"],
  "usage:read": ["admin", "agent"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", agent: "Agent", customer: "Customer" };
