import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/db";
import { env, features } from "./env";

const e = env();

export const auth = betterAuth({
  appName: "Tidal Desk",
  baseURL: e.APP_URL,
  secret: e.BETTER_AUTH_SECRET,
  trustedOrigins: [e.APP_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      authRateLimit: schema.authRateLimit,
    },
  }),
  // Passwords are hashed with scrypt by Better Auth.
  emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: true },
  socialProviders: features.github()
    ? { github: { clientId: e.GITHUB_CLIENT_ID!, clientSecret: e.GITHUB_CLIENT_SECRET! } }
    : {},
  // Stored in Postgres so limits hold across serverless instances. Enabled in dev too.
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "authRateLimit",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: e.AUTH_SIGNIN_PER_MINUTE },
      "/sign-up/email": { window: 60, max: 3 },
    },
  },
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  advanced: { useSecureCookies: e.NODE_ENV === "production" && e.APP_URL.startsWith("https://") },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
