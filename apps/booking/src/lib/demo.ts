/** Seed-data demo accounts (documented in the README; never real credentials). */
export const DEMO_PASSWORD = "demo-password-123";
export const DEMO_ACCOUNTS = {
  owner: { email: "owner@bookwell.demo", label: "Owner (Dana)" },
  staff: { email: "sam@bookwell.demo", label: "Staff (Sam)" },
  customer: { email: "customer@bookwell.demo", label: "Customer (Jamie)" },
} as const;
export type DemoRole = keyof typeof DEMO_ACCOUNTS;
