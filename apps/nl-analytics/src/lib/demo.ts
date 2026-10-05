/** Seed-data demo accounts (documented in the README; never real credentials). */
export const DEMO_PASSWORD = "demo-password-123";
export const DEMO_ACCOUNTS = {
  analyst: { email: "analyst@tally.demo", label: "Analyst (Sasha)" },
  admin: { email: "admin@tally.demo", label: "Admin (Rowan)" },
} as const;
export type DemoRole = keyof typeof DEMO_ACCOUNTS;
