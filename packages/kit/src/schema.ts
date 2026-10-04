import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Fixed-window rate limit counters (shared by every app; re-export it from the app schema). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

/** One row per AI provider call, for cost tracking and per-user limits. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id"),
    scope: text("scope"), // tenant/org/workspace id when relevant
    feature: text("feature").notNull(),
    kind: text("kind").notNull(), // chat | embedding
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms").notNull(),
    ok: integer("ok").notNull(), // 1 | 0
    errorCode: text("error_code"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_user_created_idx").on(t.userId, t.createdAt), index("ai_usage_scope_created_idx").on(t.scope, t.createdAt)],
);
