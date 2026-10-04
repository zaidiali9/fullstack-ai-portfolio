/** Seed-data demo accounts (documented in the README; never real credentials). */
export const DEMO_PASSWORD = "demo-password-123";
export const DEMO_ACCOUNTS = {
  owner: { email: "owner@cairn.demo", label: "Owner (Jordan)" },
  editor: { email: "editor@cairn.demo", label: "Editor (Lena)" },
  viewer: { email: "viewer@cairn.demo", label: "Viewer (Tom)" },
} as const;
export type DemoRole = keyof typeof DEMO_ACCOUNTS;
