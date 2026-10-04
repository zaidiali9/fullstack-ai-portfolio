import { sql } from "drizzle-orm";
import { bigint, boolean, customType, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, vector } from "drizzle-orm/pg-core";

// Shared tables (rate limit counters, AI usage log) live in @portfolio/kit.
export { aiUsage, rateLimits } from "@portfolio/kit/schema";

/** Raw file bytes. PGlite returns Uint8Array, postgres-js returns Buffer; both are normalized to Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (v) => Buffer.from(v),
});

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

/* ---------------------------------------------------------------- Workspaces */

export const workspaceRole = pgEnum("workspace_role", ["owner", "editor", "viewer"]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** Usage limits (per calendar month / total). */
  monthlyQuestionLimit: integer("monthly_question_limit").notNull().default(300),
  maxDocuments: integer("max_documents").notNull().default(50),
  /** Embeddable widget: public key + allowlist of embedding origins. */
  widgetEnabled: boolean("widget_enabled").notNull().default(false),
  widgetKey: text("widget_key").notNull().unique(),
  widgetAllowedOrigins: text("widget_allowed_origins").array().notNull().default(sql`'{}'::text[]`),
  widgetGreeting: text("widget_greeting").notNull().default("Hi! Ask me anything about our docs."),
  ...timestamps,
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("workspace_members_uq").on(t.workspaceId, t.userId), index("workspace_members_user_idx").on(t.userId)],
);

/* ---------------------------------------------------------------- Documents */

export const sourceType = pgEnum("source_type", ["file", "url"]);
export const documentStatus = pgEnum("document_status", ["queued", "processing", "ready", "failed"]);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sourceType: sourceType("source_type").notNull(),
    fileName: text("file_name"),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sourceUrl: text("source_url"),
    /** SHA-256 of the raw content; prevents duplicate uploads within a workspace. */
    contentHash: text("content_hash").notNull(),
    status: documentStatus("status").notNull().default("queued"),
    error: text("error"),
    pageCount: integer("page_count"),
    chunkCount: integer("chunk_count").notNull().default(0),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("documents_ws_created_idx").on(t.workspaceId, t.createdAt.desc()), uniqueIndex("documents_ws_hash_uq").on(t.workspaceId, t.contentHash)],
);

/** Uploaded bytes awaiting ingestion; deleted once the document is processed. */
export const documentBlobs = pgTable("document_blobs", {
  documentId: uuid("document_id")
    .primaryKey()
    .references(() => documents.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
});

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    page: integer("page"),
    heading: text("heading"),
    /** all-MiniLM-L6-v2 embedding (null when embeddings are unavailable -> keyword search only). */
    embedding: vector("embedding", { dimensions: 384 }),
  },
  (t) => [
    index("chunks_ws_idx").on(t.workspaceId),
    index("chunks_doc_ordinal_idx").on(t.documentId, t.ordinal),
    index("chunks_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("chunks_fts_idx").using("gin", sql`to_tsvector('english', ${t.content})`),
  ],
);

export const jobStatus = pgEnum("job_status", ["queued", "processing", "done", "failed"]);

/** Background ingestion queue (claimed with FOR UPDATE SKIP LOCKED). */
export const ingestionJobs = pgTable(
  "ingestion_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    status: jobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("jobs_status_run_idx").on(t.status, t.runAfter)],
);

/* ---------------------------------------------------------------- Chat */

export const conversationSource = pgEnum("conversation_source", ["app", "widget"]);
export const messageRole = pgEnum("message_role", ["user", "assistant"]);
export const messageStatus = pgEnum("message_status", ["ok", "refused", "error"]);

export interface Citation {
  n: number;
  chunkId: string;
  documentId: string;
  title: string;
  page: number | null;
  snippet: string;
  /** "model": the model wrote the [n] marker; "matched": attached by sentence-to-source matching. */
  method?: "model" | "matched";
}

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Null for anonymous widget visitors. */
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    source: conversationSource("source").notNull().default("app"),
    title: text("title").notNull(),
    ...timestamps,
  },
  (t) => [index("conversations_ws_user_updated_idx").on(t.workspaceId, t.userId, t.updatedAt.desc())],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    content: text("content").notNull(),
    status: messageStatus("status").notNull().default("ok"),
    citations: jsonb("citations").$type<Citation[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_created_idx").on(t.conversationId, t.createdAt)],
);

export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceRole = (typeof workspaceRole.enumValues)[number];
export type Document = typeof documents.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type Message = typeof messages.$inferSelect;
