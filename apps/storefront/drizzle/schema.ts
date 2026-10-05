import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";

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
  /** "customer" by default; "admin" can manage products and orders. Not settable at sign-up. */
  role: text("role").notNull().default("customer"),
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


/* ---------------------------------------------------------------- Catalog */

export const categories = ["kitchen", "outdoor", "home", "bath", "stationery", "garden"] as const;
export type Category = (typeof categories)[number];

export const descriptionSource = pgEnum("description_source", ["seed", "manual", "ai_edited"]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** Who wrote the current description: seed data, an admin by hand, or an admin editing an AI draft. */
    descriptionSource: descriptionSource("description_source").notNull().default("manual"),
    category: text("category").$type<Category>().notNull(),
    priceCents: integer("price_cents").notNull(),
    stock: integer("stock").notNull().default(0),
    active: boolean("active").notNull().default(true),
    featured: boolean("featured").notNull().default(false),
    imagePath: text("image_path").notNull(),
    /** Simple key/value facts (material, size…) used for display and AI description drafts. */
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    /** all-MiniLM-L6-v2 embedding of name + category + description (null -> keyword search only). */
    embedding: vector("embedding", { dimensions: 384 }),
    ...timestamps,
  },
  (t) => [
    index("products_active_category_idx").on(t.active, t.category),
    index("products_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("products_fts_idx").using("gin", sql`to_tsvector('english', ${t.name} || ' ' || ${t.category} || ' ' || ${t.description})`),
    check("products_price_positive", sql`${t.priceCents} > 0`),
    check("products_stock_non_negative", sql`${t.stock} >= 0`),
  ],
);

/* ---------------------------------------------------------------- Cart */

/** Anonymous carts keyed by an httpOnly cookie; attached to the user once they sign in. */
export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("carts_user_idx").on(t.userId)],
);

export const cartItems = pgTable(
  "cart_items",
  {
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
  },
  (t) => [primaryKey({ columns: [t.cartId, t.productId] }), check("cart_items_quantity_range", sql`${t.quantity} between 1 and 20`)],
);

/* ---------------------------------------------------------------- Orders */

export const orderStatus = pgEnum("order_status", ["pending", "paid", "fulfilled", "cancelled", "refunded"]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human-friendly order number shown to customers. */
    number: integer("number").generatedAlwaysAsIdentity({ startWith: 1001 }).notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    status: orderStatus("status").notNull().default("pending"),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    stripeSessionId: text("stripe_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    shippingName: text("shipping_name"),
    shippingAddress: jsonb("shipping_address").$type<Record<string, string | null>>(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("orders_user_created_idx").on(t.userId, t.createdAt.desc()), index("orders_status_created_idx").on(t.status, t.createdAt.desc())],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    /** Snapshot at purchase time: later price or name changes don't rewrite history. */
    name: text("name").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

/** Processed Stripe webhook events (idempotency). */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
