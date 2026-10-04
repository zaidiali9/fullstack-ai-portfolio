import type { WorkspaceRole } from "@db/schema";

/** Role-based access control. Every server action and API route checks one of these. */
export const PERMISSIONS = {
  "chat:ask": ["owner", "editor", "viewer"],
  "docs:read": ["owner", "editor", "viewer"],
  "docs:write": ["owner", "editor"],
  "members:manage": ["owner"],
  "widget:manage": ["owner"],
  "workspace:settings": ["owner"],
  "usage:read": ["owner", "editor"],
} as const satisfies Record<string, readonly WorkspaceRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: WorkspaceRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly WorkspaceRole[]).includes(role);
}
