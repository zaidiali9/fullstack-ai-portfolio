/** Seed-data demo accounts (documented in the README; never real credentials). */
export const DEMO_PASSWORD = "demo-password-123";
export const DEMO_ACCOUNTS = {
  admin: { email: "admin@fernwood.demo", label: "Store admin (Morgan)" },
  customer: { email: "customer@fernwood.demo", label: "Customer (Alex)" },
} as const;
export type DemoRole = keyof typeof DEMO_ACCOUNTS;
