import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3003"),
  DATABASE_URL: optional,
  PGLITE_DIR: z.string().default(".data/pglite"),
  BETTER_AUTH_SECRET: optional,
  GITHUB_CLIENT_ID: optional,
  GITHUB_CLIENT_SECRET: optional,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  /** Flat shipping in cents; free above FREE_SHIPPING_OVER_CENTS. */
  SHIPPING_CENTS: z.coerce.number().int().min(0).default(800),
  FREE_SHIPPING_OVER_CENTS: z.coerce.number().int().min(0).default(7500),
  /** Admin AI description drafts per minute. */
  AI_USER_PER_MINUTE: z.coerce.number().int().positive().default(10),
  /** Search requests per IP per minute (search embeds the query). */
  SEARCH_PER_MINUTE: z.coerce.number().int().positive().default(60),
  AUTH_SIGNIN_PER_MINUTE: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  if (parsed.data.NODE_ENV === "production" && !parsed.data.BETTER_AUTH_SECRET && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("BETTER_AUTH_SECRET must be set in production (generate one with `openssl rand -base64 32`).");
  }
  cached = parsed.data;
  return cached;
}

export const features = {
  github: () => !!(env().GITHUB_CLIENT_ID && env().GITHUB_CLIENT_SECRET),
  stripe: () => !!env().STRIPE_SECRET_KEY,
};
