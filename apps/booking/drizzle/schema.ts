import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  /** "customer" by default; "owner" and "staff" can use the dashboard. Not settable at sign-up. */
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

/* ---------------------------------------------------------------- Business setup */

/** Single-tenant settings row (id = 1). */
export const business = pgTable("business", {
  id: smallint("id").primaryKey().default(1),
  name: text("name").notNull(),
  /** IANA timezone for opening hours and availability, e.g. "America/New_York". */
  timezone: text("timezone").notNull(),
  /** Bookable start times are aligned to this many minutes. */
  slotIntervalMin: smallint("slot_interval_min").notNull().default(15),
  /** How far ahead customers can book. */
  bookingHorizonDays: smallint("booking_horizon_days").notNull().default(30),
  /** Minimum notice before an appointment can be booked or cancelled online. */
  minNoticeMin: smallint("min_notice_min").notNull().default(60),
});

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    durationMin: smallint("duration_min").notNull(),
    /** Clean-up time after each appointment, blocked for the staff member. */
    bufferMin: smallint("buffer_min").notNull().default(0),
    priceCents: integer("price_cents").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [check("services_duration_range", sql`${t.durationMin} between 10 and 480`), check("services_price_non_negative", sql`${t.priceCents} >= 0`)],
);

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Linked login for staff who use the dashboard. */
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  title: text("title").notNull(),
  bio: text("bio").notNull().default(""),
  /** Hex color used in the calendar. */
  color: text("color").notNull().default("#4f46e5"),
  active: boolean("active").notNull().default(true),
});

export const staffServices = pgTable(
  "staff_services",
  {
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.serviceId] })],
);

/** Weekly working hours in the business timezone (minutes from midnight). */
export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    /** 0 = Sunday … 6 = Saturday. */
    weekday: smallint("weekday").notNull(),
    startMin: smallint("start_min").notNull(),
    endMin: smallint("end_min").notNull(),
  },
  (t) => [
    index("availability_staff_weekday_idx").on(t.staffId, t.weekday),
    check("availability_weekday_range", sql`${t.weekday} between 0 and 6`),
    check("availability_minutes", sql`${t.startMin} >= 0 and ${t.endMin} <= 1440 and ${t.startMin} < ${t.endMin}`),
  ],
);

export const timeOff = pgTable(
  "time_off",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull().default(""),
  },
  (t) => [index("time_off_staff_idx").on(t.staffId, t.startsAt), check("time_off_range", sql`${t.startsAt} < ${t.endsAt}`)],
);

/* ---------------------------------------------------------------- Bookings */

export const bookingStatus = pgEnum("booking_status", ["held", "confirmed", "cancelled", "completed", "no_show"]);

/**
 * Appointments. Overlap prevention is enforced by the database: an exclusion constraint
 * (btree_gist) rejects two held/confirmed bookings for the same staff member whose
 * [starts_at, blocked_until) ranges overlap — see the migration SQL.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Short human-friendly reference, e.g. "BK-7F3K2Q". */
    reference: text("reference").notNull().unique(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** ends_at + service buffer: the staff member is unavailable until then. */
    blockedUntil: timestamp("blocked_until", { withTimezone: true }).notNull(),
    status: bookingStatus("status").notNull().default("held"),
    /** Holds expire if not confirmed (expired holds are cleared before new bookings). */
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    notes: text("notes").notNull().default(""),
    priceCents: integer("price_cents").notNull(),
    /** Optimistic concurrency: incremented on every change; updates must quote the version they read. */
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("bookings_staff_starts_idx").on(t.staffId, t.startsAt),
    index("bookings_customer_starts_idx").on(t.customerId, t.startsAt.desc()),
    index("bookings_starts_status_idx").on(t.startsAt, t.status),
    check("bookings_time_order", sql`${t.startsAt} < ${t.endsAt} and ${t.endsAt} <= ${t.blockedUntil}`),
  ],
);

export const activity = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_created_idx").on(t.createdAt.desc())],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_unread_idx").on(t.userId, t.readAt, t.createdAt.desc())],
);

export type Service = typeof services.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
