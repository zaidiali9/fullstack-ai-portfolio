import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3001"),
  DATABASE_URL: optional,
  PGLITE_DIR: z.string().default(".data/pglite"),
  BETTER_AUTH_SECRET: optional,
  GITHUB_CLIENT_ID: optional,
  GITHUB_CLIENT_SECRET: optional,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_PRO: optional,
  SMTP_URL: optional,
  EMAIL_FROM: z.string().default("Tidal Desk <no-reply@tidaldesk.local>"),
  /** Daily AI calls per organization by plan. */
  AI_DAILY_LIMIT_FREE: z.coerce.number().int().positive().default(100),
  AI_DAILY_LIMIT_PRO: z.coerce.number().int().positive().default(2000),
  /** Sign-in attempts per IP per minute (Better Auth limiter). */
  AUTH_SIGNIN_PER_MINUTE: z.coerce.number().int().positive().default(5),
  /** Per-user AI requests per minute. */
  AI_USER_PER_MINUTE: z.coerce.number().int().positive().default(20),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated server environment. Throws at first use with a readable list of problems. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.BETTER_AUTH_SECRET && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("BETTER_AUTH_SECRET must be set in production (generate one with `openssl rand -base64 32`).");
  }
  cached = parsed.data;
  return cached;
}

export const features = {
  github: () => !!(env().GITHUB_CLIENT_ID && env().GITHUB_CLIENT_SECRET),
  stripe: () => !!(env().STRIPE_SECRET_KEY && env().STRIPE_PRICE_PRO),
};
