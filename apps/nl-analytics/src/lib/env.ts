import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3005"),
  DATABASE_URL: optional,
  PGLITE_DIR: z.string().default(".data/pglite"),
  BETTER_AUTH_SECRET: optional,
  GITHUB_CLIENT_ID: optional,
  GITHUB_CLIENT_SECRET: optional,
  /** Natural-language questions and result summaries per user per minute. */
  AI_USER_PER_MINUTE: z.coerce.number().int().positive().default(10),
  /** Query executions (incl. dashboard tiles and CSV exports) per user or IP per minute. */
  QUERIES_PER_MINUTE: z.coerce.number().int().positive().default(60),
  /** Execution limits for user/model SQL (see src/server/sql/execute.ts). */
  QUERY_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(5000),
  QUERY_MAX_ROWS: z.coerce.number().int().min(10).max(10_000).default(1000),
  QUERY_MAX_COST: z.coerce.number().positive().default(250_000),
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
};
