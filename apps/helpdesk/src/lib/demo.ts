/** Seed-data demo accounts (documented in the README; never real credentials). */
export const DEMO_PASSWORD = "demo-password-123";
export const DEMO_ACCOUNTS = {
  admin: { email: "admin@tidaldesk.demo", label: "Admin (Ava)" },
  agent: { email: "agent@tidaldesk.demo", label: "Agent (Sam)" },
  customer: { email: "customer@tidaldesk.demo", label: "Customer (Riley)" },
} as const;
export type DemoRole = keyof typeof DEMO_ACCOUNTS;
