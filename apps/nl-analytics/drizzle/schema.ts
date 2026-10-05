import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, jsonb, numeric, pgEnum, pgSchema, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Shared tables (rate limit counters, AI usage log) live in @portfolio/kit.
export { aiUsage, rateLimits } from "@portfolio/kit/schema";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* ---------------------------------------------------------------- Better Auth */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** "analyst" by default; "admin" also sees the query audit log. Not settable at sign-up. */
  role: text("role").notNull().default("analyst"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Better Auth's own limiter for /api/auth/* (sign-in, sign-up). */
export const authRateLimit = pgTable("auth_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ---------------------------------------------------------------- App data */

/** Chart configuration chosen by the model (validated) or by the user. */
export interface ChartSpec {
  type: "bar" | "line" | "area" | "pie" | "number" | "table";
  x?: string | null;
  y?: string[];
}

export const savedQueries = pgTable(
  "saved_queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** The natural-language question (empty for hand-written SQL). */
    question: text("question").notNull().default(""),
    sql: text("sql").notNull(),
    chart: jsonb("chart").$type<ChartSpec>().notNull(),
    /** "ai" when the SQL came from the model (possibly edited), "manual" when written by hand. */
    source: text("source").notNull().default("ai"),
    ...timestamps,
  },
  (t) => [index("saved_queries_owner_idx").on(t.ownerId, t.updatedAt.desc()), check("saved_queries_sql_len", sql`length(${t.sql}) <= 4000`)],
);

export const dashboards = pgTable(
  "dashboards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** Random token for the public read-only link; null when not shared. */
    shareToken: text("share_token").unique(),
    ...timestamps,
  },
  (t) => [index("dashboards_owner_idx").on(t.ownerId, t.updatedAt.desc())],
);

export const dashboardTiles = pgTable(
  "dashboard_tiles",
  {
    dashboardId: uuid("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    queryId: uuid("query_id")
      .notNull()
      .references(() => savedQueries.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    /** 1 = half width, 2 = full width. */
    width: smallint("width").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.dashboardId, t.queryId] }), check("dashboard_tiles_width", sql`${t.width} in (1, 2)`)],
);

export const runStatus = pgEnum("run_status", ["ok", "rejected", "error"]);

/** Audit log of every query execution attempt (including ones the guard rejected). */
export const queryRuns = pgTable(
  "query_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** ai | manual | saved | dashboard | shared | export */
    source: text("source").notNull(),
    question: text("question").notNull().default(""),
    sql: text("sql").notNull(),
    status: runStatus("status").notNull(),
    reason: text("reason"),
    rowCount: integer("row_count"),
    durationMs: integer("duration_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("query_runs_created_idx").on(t.createdAt.desc()), index("query_runs_user_idx").on(t.userId, t.createdAt.desc())],
);

export type SavedQuery = typeof savedQueries.$inferSelect;
export type Dashboard = typeof dashboards.$inferSelect;
export type QueryRun = typeof queryRuns.$inferSelect;

/* ---------------------------------------------------------------- Demo dataset (schema "demo")
 * SEED DATA: a fictional online retailer, "Lanternfish Supply Co.". Generated by drizzle/seed-data.ts.
 * Model-generated SQL can read ONLY these tables (guard allowlist + analytics_reader role).
 */

export const demo = pgSchema("demo");

export const regions = demo.table("regions", {
  id: smallint("id").primaryKey(),
  name: text("name").notNull(),
});

export const customers = demo.table(
  "customers",
  {
    id: integer("id").primaryKey(),
    regionId: smallint("region_id")
      .notNull()
      .references(() => regions.id),
    signupDate: date("signup_date").notNull(),
    segment: text("segment").notNull(),
    acquisitionChannel: text("acquisition_channel").notNull(),
  },
  (t) => [index("customers_region_idx").on(t.regionId), index("customers_signup_idx").on(t.signupDate)],
);

export const products = demo.table("products", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 10, scale: 2 }).notNull(),
  launchedOn: date("launched_on").notNull(),
});

export const orders = demo.table(
  "orders",
  {
    id: integer("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    orderDate: date("order_date").notNull(),
    status: text("status").notNull(),
    salesChannel: text("sales_channel").notNull(),
    discountPct: numeric("discount_pct", { precision: 4, scale: 1 }).notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [index("orders_date_idx").on(t.orderDate), index("orders_customer_idx").on(t.customerId)],
);

export const orderItems = demo.table(
  "order_items",
  {
    id: integer("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    quantity: smallint("quantity").notNull(),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_product_idx").on(t.productId)],
);

export const marketingSpend = demo.table(
  "marketing_spend",
  {
    month: date("month").notNull(),
    channel: text("channel").notNull(),
    spend: numeric("spend", { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.month, t.channel] })],
);

export const supportTickets = demo.table(
  "support_tickets",
  {
    id: integer("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    category: text("category").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    satisfaction: smallint("satisfaction"),
  },
  (t) => [index("support_tickets_opened_idx").on(t.openedAt)],
);
