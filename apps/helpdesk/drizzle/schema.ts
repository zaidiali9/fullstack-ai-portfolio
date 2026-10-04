import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

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

/* ---------------------------------------------------------------- Tenancy */

export const plan = pgEnum("plan", ["free", "pro"]);
export const memberRole = pgEnum("member_role", ["admin", "agent", "customer"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: plan("plan").notNull().default("free"),
  /** Anyone signed in may join as a customer via /join/<slug>. */
  allowCustomerSignup: boolean("allow_customer_signup").notNull().default(true),
  ticketSeq: integer("ticket_seq").notNull().default(0),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  subscriptionStatus: text("subscription_status"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  ...timestamps,
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("memberships_org_user_uq").on(t.orgId, t.userId), index("memberships_user_idx").on(t.userId)],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: memberRole("role").notNull(),
    /** SHA-256 of the invite token; the raw token only exists in the emailed link. */
    tokenHash: text("token_hash").notNull().unique(),
    invitedById: text("invited_by_id").references(() => user.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invitations_org_idx").on(t.orgId)],
);

/* ---------------------------------------------------------------- Tickets */

export const ticketStatus = pgEnum("ticket_status", ["open", "pending", "resolved", "closed"]);
export const ticketPriority = pgEnum("ticket_priority", ["low", "medium", "high", "urgent"]);
export const ticketCategory = pgEnum("ticket_category", ["billing", "technical", "account", "other"]);
export const sentiment = pgEnum("sentiment", ["negative", "neutral", "positive"]);
export const triageStatus = pgEnum("triage_status", ["pending", "done", "unavailable", "failed", "manual"]);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    subject: text("subject").notNull(),
    status: ticketStatus("status").notNull().default("open"),
    priority: ticketPriority("priority").notNull().default("medium"),
    category: ticketCategory("category"),
    sentiment: sentiment("sentiment"),
    triageStatus: triageStatus("triage_status").notNull().default("pending"),
    /** Short AI-written summary from triage (null when AI unavailable). */
    aiSummary: text("ai_summary"),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tickets_org_number_uq").on(t.orgId, t.number),
    index("tickets_org_status_last_idx").on(t.orgId, t.status, t.lastMessageAt.desc()),
    index("tickets_org_last_idx").on(t.orgId, t.lastMessageAt.desc()),
    index("tickets_org_requester_idx").on(t.orgId, t.requesterId),
    index("tickets_org_assignee_idx").on(t.orgId, t.assigneeId),
  ],
);

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** Internal notes are visible to admins/agents only. */
    internal: boolean("internal").notNull().default(false),
    /** The agent started from an AI draft (kept for transparency/analytics). */
    aiAssisted: boolean("ai_assisted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ticket_messages_ticket_created_idx").on(t.ticketId, t.createdAt)],
);

/* ---------------------------------------------------------------- Knowledge base */

export const kbArticles = pgTable(
  "kb_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    published: boolean("published").notNull().default(true),
    /** all-MiniLM-L6-v2 embedding of title + body (null until embedded or when AI unavailable). */
    embedding: vector("embedding", { dimensions: 384 }),
    embeddingModel: text("embedding_model"),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("kb_org_published_idx").on(t.orgId, t.published),
    index("kb_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("kb_fts_idx").using("gin", sql`to_tsvector('english', ${t.title} || ' ' || ${t.body})`),
  ],
);

/* ---------------------------------------------------------------- Audit, email, billing */

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_org_created_idx").on(t.orgId, t.createdAt.desc())],
);

export const emailStatus = pgEnum("email_status", ["logged", "sent", "failed"]);

/** Email-style notifications. Without SMTP they are only logged here (viewable in Settings → Emails). */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    text: text("text").notNull(),
    status: emailStatus("status").notNull().default("logged"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_outbox_org_created_idx").on(t.orgId, t.createdAt.desc())],
);

/** Processed Stripe webhook events (idempotency). */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Role = (typeof memberRole.enumValues)[number];
export type Ticket = typeof tickets.$inferSelect;
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type KbArticle = typeof kbArticles.$inferSelect;
