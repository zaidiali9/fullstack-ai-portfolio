import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3002"),
  DATABASE_URL: optional,
  PGLITE_DIR: z.string().default(".data/pglite"),
  BETTER_AUTH_SECRET: optional,
  GITHUB_CLIENT_ID: optional,
  GITHUB_CLIENT_SECRET: optional,
  /** Bearer token for /api/cron/ingest (Vercel Cron or any scheduler). */
  CRON_SECRET: optional,
  MAX_UPLOAD_MB: z.coerce.number().positive().max(50).default(10),
  /** Per-user chat questions per minute. */
  AI_USER_PER_MINUTE: z.coerce.number().int().positive().default(20),
  /** Anonymous widget questions per IP per minute. */
  WIDGET_PER_MINUTE: z.coerce.number().int().positive().default(6),
  AUTH_SIGNIN_PER_MINUTE: z.coerce.number().int().positive().default(5),
  /** Allow ingesting URLs that resolve to private/loopback addresses (tests only). */
  ALLOW_PRIVATE_URLS: z.stringbool().default(false),
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

/** Validated server environment. Throws at first use with a readable list of problems. */
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
};
