import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { conflict, enforceRateLimit, forbidden, HttpError, notFound } from "@portfolio/kit";
import { db, schema, type Tx } from "@/db";
import { env } from "@/lib/env";
import type { AppUser } from "./access";
import { isTeam } from "./access";
import { findOpenings, type Opening } from "./availability";
import { getBusiness, getServiceById, listStaff, type ServiceWithStaff } from "./catalog";
import { publish, type BookingAction } from "./realtime";
import { nearestAlternatives } from "./scheduling/slots";
import { addDays, dateInTz, dayBounds, formatDateLong, formatTime, type DateStr } from "./scheduling/time";

/* ------------------------------------------------------------------ helpers */

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const newReference = () => `BK-${Array.from({ length: 6 }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join("")}`;

/** Postgres SQLSTATE from a driver error, looking through wrapper errors (Drizzle wraps the cause). */
export function pgCode(err: unknown): string | undefined {
  let e: unknown = err;
  for (let i = 0; i < 5 && e && typeof e === "object"; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}
/** exclusion_violation: the bookings_no_overlap constraint rejected an overlapping booking. */
export const isOverlap = (err: unknown) => pgCode(err) === "23P01";

export interface Alternative {
  start: string;
  staffId: string;
  staffName: string;
}

/** 409 with the nearest open times (same service, same staff preference, ±2 days). */
async function slotTaken(service: ServiceWithStaff, start: Date, staffId: string | null, ignoreBookingId?: string) {
  const b = await getBusiness();
  const date = dateInTz(start, b.timezone);
  const [openings, staff] = await Promise.all([
    findOpenings({ service, staffId, fromDate: addDays(date, -1), toDate: addDays(date, 2), ignoreBookingId }),
    listStaff(),
  ]);
  const alts = nearestAlternatives(start, dedupeByTime(openings), 3).map(
    (o): Alternative => ({ start: o.start.toISOString(), staffId: o.staffId, staffName: staff.find((s) => s.id === o.staffId)?.name ?? "" }),
  );
  return conflict("Sorry — that time was just taken. Here are the nearest open times.", { alternatives: alts });
}

const dedupeByTime = (openings: Opening[]) => {
  const seen = new Set<number>();
  return openings.filter((o) => (seen.has(o.start.getTime()) ? false : (seen.add(o.start.getTime()), true)));
};

async function ownerIds(exec: typeof db | Tx) {
  const rows = await exec.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.role, "owner"));
  return rows.map((r) => r.id);
}

/** Notify the staff member's login (if any) and the owners — never the actor themselves. */
async function notifyTeam(tx: Tx, opts: { staffId: string; actorId: string; bookingId: string; title: string; body: string }) {
  const [s] = await tx.select({ userId: schema.staff.userId }).from(schema.staff).where(eq(schema.staff.id, opts.staffId));
  const recipients = new Set([...(await ownerIds(tx)), ...(s?.userId ? [s.userId] : [])]);
  recipients.delete(opts.actorId);
  if (recipients.size === 0) return;
  await tx.insert(schema.notifications).values([...recipients].map((userId) => ({ userId, title: opts.title, body: opts.body, bookingId: opts.bookingId })));
}

async function logActivity(tx: Tx, a: { actorId: string; type: string; bookingId: string; summary: string; meta?: Record<string, unknown> }) {
  await tx.insert(schema.activity).values(a);
}

const describe = async (serviceName: string, start: Date) => {
  const b = await getBusiness();
  return `${serviceName} on ${formatDateLong(dateInTz(start, b.timezone))} at ${formatTime(start, b.timezone)}`;
};

async function loadBooking(id: string) {
  const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, id)).limit(1);
  return row ?? null;
}

/** Customers may act only on their own bookings; team members on any. 404 otherwise (no existence leak). */
async function loadForActor(user: AppUser, id: string) {
  const bk = await loadBooking(id);
  if (!bk || (!isTeam(user) && bk.customerId !== user.id)) throw notFound("Booking");
  return bk;
}

/* --------------------------------------------------------------------- hold */

export const holdInput = z.object({
  serviceId: z.uuid(),
  staffId: z.union([z.uuid(), z.literal("any")]),
  start: z.iso.datetime({ offset: true }),
});

/**
 * Reserve a slot for HOLD_MINUTES while the customer confirms. The availability check is
 * advisory; the database exclusion constraint is the real guard, so two simultaneous holds for
 * the same staff/time can never both succeed. With staff "any", each free staff member is tried.
 */
export async function holdSlot(user: AppUser, raw: unknown) {
  const input = holdInput.parse(raw);
  await enforceRateLimit(db, `hold:${user.id}`, { limit: env().HOLDS_PER_MINUTE, windowMs: 60_000, message: "Too many booking attempts. Please wait a minute." });
  const service = await getServiceById(input.serviceId);
  const preferred = input.staffId === "any" ? null : input.staffId;
  if (preferred && !service.staffIds.includes(preferred)) throw new HttpError(400, "validation_error", "That staff member doesn't offer this service.");
  const b = await getBusiness();
  const start = new Date(input.start);
  const date = dateInTz(start, b.timezone);
  const openings = await findOpenings({ service, staffId: preferred, fromDate: date, toDate: date });
  const candidates = openings.filter((o) => o.start.getTime() === start.getTime()).map((o) => o.staffId);
  if (candidates.length === 0) throw await slotTaken(service, start, preferred);

  const end = new Date(start.getTime() + service.durationMin * 60_000);
  const blockedUntil = new Date(end.getTime() + service.bufferMin * 60_000);
  const holdExpiresAt = new Date(Date.now() + env().HOLD_MINUTES * 60_000);

  // One active hold per customer: picking a new time releases the previous one.
  const released = await db
    .delete(schema.bookings)
    .where(and(eq(schema.bookings.customerId, user.id), eq(schema.bookings.status, "held")))
    .returning({ id: schema.bookings.id, reference: schema.bookings.reference, staffId: schema.bookings.staffId, startsAt: schema.bookings.startsAt });
  for (const r of released) await publish(db, { action: "released", bookingId: r.id, reference: r.reference, staffId: r.staffId, dates: [dateInTz(r.startsAt, b.timezone)] });

  for (const staffId of candidates) {
    try {
      const booking = await db.transaction(async (tx) => {
        // Expired holds still match the constraint's WHERE clause, so clear them first.
        await tx
          .delete(schema.bookings)
          .where(and(eq(schema.bookings.staffId, staffId), eq(schema.bookings.status, "held"), lte(schema.bookings.holdExpiresAt, sql`now()`)));
        const [row] = await tx
          .insert(schema.bookings)
          .values({
            reference: newReference(),
            serviceId: service.id,
            staffId,
            customerId: user.id,
            startsAt: start,
            endsAt: end,
            blockedUntil,
            status: "held",
            holdExpiresAt,
            priceCents: service.priceCents,
          })
          .returning();
        await publish(tx, { action: "held", bookingId: row!.id, reference: row!.reference, staffId, dates: [date] });
        return row!;
      });
      return booking;
    } catch (err) {
      if (isOverlap(err)) continue; // someone else got this staff member first; try the next one
      throw err;
    }
  }
  throw await slotTaken(service, start, preferred);
}

/* ------------------------------------------------------------------ confirm */

export const confirmInput = z.object({
  bookingId: z.uuid(),
  notes: z.string().trim().max(500, "Notes can be at most 500 characters.").default(""),
});

export async function confirmBooking(user: AppUser, raw: unknown) {
  const input = confirmInput.parse(raw);
  const existing = await loadBooking(input.bookingId);
  if (!existing || existing.customerId !== user.id) throw notFound("Booking");
  if (existing.status === "confirmed") return existing; // double submit: idempotent
  const b = await getBusiness();
  const service = await getServiceById(existing.serviceId);
  const what = await describe(service.name, existing.startsAt);
  // Note: inside a transaction only `tx` may be used (PGlite has a single connection).
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.bookings)
      .set({ status: "confirmed", holdExpiresAt: null, notes: input.notes, version: sql`${schema.bookings.version} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(schema.bookings.id, input.bookingId),
          eq(schema.bookings.customerId, user.id),
          eq(schema.bookings.status, "held"),
          sql`${schema.bookings.holdExpiresAt} > now()`,
        ),
      )
      .returning();
    if (!row) throw new HttpError(409, "hold_expired", "Your hold on this time expired. Please pick the time again.");
    await logActivity(tx, { actorId: user.id, type: "booking.confirmed", bookingId: row.id, summary: `${user.name} booked ${what} (${row.reference})` });
    await notifyTeam(tx, { staffId: row.staffId, actorId: user.id, bookingId: row.id, title: "New booking", body: `${user.name} booked ${what}.` });
    await publish(tx, { action: "confirmed", bookingId: row.id, reference: row.reference, staffId: row.staffId, dates: [dateInTz(row.startsAt, b.timezone)] });
    return row;
  });
}

/* ------------------------------------------------------------------- cancel */

export const changeInput = z.object({ bookingId: z.uuid(), version: z.coerce.number().int().positive() });

const stale = () => new HttpError(409, "stale", "This booking was changed by someone else. Refresh to see the latest version.");

async function assertCustomerNotice(user: AppUser, startsAt: Date, verb: string) {
  if (isTeam(user)) return;
  const b = await getBusiness();
  if (startsAt.getTime() - Date.now() < b.minNoticeMin * 60_000) {
    throw new HttpError(422, "too_late", `Online ${verb} closes ${b.minNoticeMin} minutes before the appointment. Please call the studio.`);
  }
}

export async function cancelBooking(user: AppUser, raw: unknown) {
  const input = changeInput.parse(raw);
  const bk = await loadForActor(user, input.bookingId);
  if (bk.status !== "confirmed" && bk.status !== "held") throw new HttpError(409, "not_active", "Only upcoming bookings can be cancelled.");
  await assertCustomerNotice(user, bk.startsAt, "cancellation");
  const b = await getBusiness();
  const service = await getServiceById(bk.serviceId);
  const what = await describe(service.name, bk.startsAt);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.bookings)
      .set({ status: "cancelled", holdExpiresAt: null, version: sql`${schema.bookings.version} + 1`, updatedAt: new Date() })
      .where(and(eq(schema.bookings.id, bk.id), eq(schema.bookings.version, input.version)))
      .returning();
    if (!row) throw stale();
    await logActivity(tx, { actorId: user.id, type: "booking.cancelled", bookingId: row.id, summary: `${user.name} cancelled ${what} (${row.reference})` });
    if (isTeam(user) && row.customerId !== user.id) {
      await tx.insert(schema.notifications).values({ userId: row.customerId, title: "Booking cancelled", body: `The studio cancelled your ${what}.`, bookingId: row.id });
    }
    await notifyTeam(tx, { staffId: row.staffId, actorId: user.id, bookingId: row.id, title: "Booking cancelled", body: `${what} was cancelled.` });
    await publish(tx, { action: "cancelled", bookingId: row.id, reference: row.reference, staffId: row.staffId, dates: [dateInTz(row.startsAt, b.timezone)] });
    return row;
  });
}

/* --------------------------------------------------------------- reschedule */

export const rescheduleInput = changeInput.extend({
  start: z.iso.datetime({ offset: true }),
  staffId: z.union([z.uuid(), z.literal("any")]).default("any"),
});

/**
 * Move a confirmed booking in place (same row, same reference). Requires the version the user saw
 * (optimistic concurrency); the exclusion constraint still guards against overlaps.
 */
export async function rescheduleBooking(user: AppUser, raw: unknown) {
  const input = rescheduleInput.parse(raw);
  const bk = await loadForActor(user, input.bookingId);
  if (bk.status !== "confirmed") throw new HttpError(409, "not_active", "Only confirmed bookings can be rescheduled.");
  if (bk.version !== input.version) throw stale();
  await assertCustomerNotice(user, bk.startsAt, "rescheduling");
  const service = await getServiceById(bk.serviceId);
  const preferred = input.staffId === "any" ? null : input.staffId;
  if (preferred && !service.staffIds.includes(preferred)) throw new HttpError(400, "validation_error", "That staff member doesn't offer this service.");
  const b = await getBusiness();
  const start = new Date(input.start);
  const date = dateInTz(start, b.timezone);
  const openings = await findOpenings({ service, staffId: preferred, fromDate: date, toDate: date, ignoreBookingId: bk.id });
  const candidates = openings.filter((o) => o.start.getTime() === start.getTime()).map((o) => o.staffId);
  // Keep the same staff member when they're free.
  candidates.sort((a, c) => Number(c === bk.staffId) - Number(a === bk.staffId));
  if (candidates.length === 0) throw await slotTaken(service, start, preferred, bk.id);
  const end = new Date(start.getTime() + service.durationMin * 60_000);
  const blockedUntil = new Date(end.getTime() + service.bufferMin * 60_000);
  const before = await describe(service.name, bk.startsAt);
  const after = await describe(service.name, start);

  for (const staffId of candidates) {
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .update(schema.bookings)
          .set({ staffId, startsAt: start, endsAt: end, blockedUntil, version: sql`${schema.bookings.version} + 1`, updatedAt: new Date() })
          .where(and(eq(schema.bookings.id, bk.id), eq(schema.bookings.version, input.version), eq(schema.bookings.status, "confirmed")))
          .returning();
        if (!row) throw stale();
        await logActivity(tx, { actorId: user.id, type: "booking.rescheduled", bookingId: row.id, summary: `${user.name} moved ${row.reference} from ${before} to ${after}` });
        if (isTeam(user) && row.customerId !== user.id) {
          await tx.insert(schema.notifications).values({ userId: row.customerId, title: "Booking moved", body: `The studio moved your ${before} to ${after}.`, bookingId: row.id });
        }
        await notifyTeam(tx, { staffId, actorId: user.id, bookingId: row.id, title: "Booking moved", body: `${row.reference} moved to ${after}.` });
        const dates = [...new Set([dateInTz(bk.startsAt, b.timezone), date])];
        await publish(tx, { action: "rescheduled", bookingId: row.id, reference: row.reference, staffId, dates });
        return row;
      });
    } catch (err) {
      if (isOverlap(err)) continue;
      throw err;
    }
  }
  throw await slotTaken(service, start, preferred, bk.id);
}

/* ------------------------------------------------------------------ outcome */

export const outcomeInput = changeInput.extend({ status: z.enum(["completed", "no_show"]) });

/** Team only: record what happened after the appointment started. */
export async function setOutcome(user: AppUser, raw: unknown) {
  if (!isTeam(user)) throw forbidden();
  const input = outcomeInput.parse(raw);
  const bk = await loadForActor(user, input.bookingId);
  if (bk.status !== "confirmed") throw new HttpError(409, "not_active", "Only confirmed bookings can be marked.");
  if (bk.startsAt.getTime() > Date.now()) throw new HttpError(422, "not_started", "You can mark the outcome once the appointment has started.");
  const b = await getBusiness();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.bookings)
      .set({ status: input.status, version: sql`${schema.bookings.version} + 1`, updatedAt: new Date() })
      .where(and(eq(schema.bookings.id, bk.id), eq(schema.bookings.version, input.version)))
      .returning();
    if (!row) throw stale();
    const label = input.status === "completed" ? "completed" : "a no-show";
    await logActivity(tx, { actorId: user.id, type: `booking.${input.status}`, bookingId: row.id, summary: `${user.name} marked ${row.reference} as ${label}` });
    await publish(tx, { action: input.status as BookingAction, bookingId: row.id, reference: row.reference, staffId: row.staffId, dates: [dateInTz(row.startsAt, b.timezone)] });
    return row;
  });
}

/* -------------------------------------------------------------------- reads */

/** What the current moment allows for a booking (kept out of render for purity). */
export async function bookingTiming(startsAt: Date) {
  const b = await getBusiness();
  const msUntil = startsAt.getTime() - Date.now();
  return { started: msUntil <= 0, customerCanChange: msUntil >= b.minNoticeMin * 60_000 };
}

const bookingView = {
  id: schema.bookings.id,
  reference: schema.bookings.reference,
  status: schema.bookings.status,
  startsAt: schema.bookings.startsAt,
  endsAt: schema.bookings.endsAt,
  blockedUntil: schema.bookings.blockedUntil,
  holdExpiresAt: schema.bookings.holdExpiresAt,
  notes: schema.bookings.notes,
  priceCents: schema.bookings.priceCents,
  version: schema.bookings.version,
  customerId: schema.bookings.customerId,
  serviceId: schema.bookings.serviceId,
  serviceName: schema.services.name,
  serviceSlug: schema.services.slug,
  durationMin: schema.services.durationMin,
  staffId: schema.bookings.staffId,
  staffName: schema.staff.name,
  staffColor: schema.staff.color,
  customerName: schema.user.name,
  customerEmail: schema.user.email,
};
export type BookingView = Awaited<ReturnType<typeof getBooking>>;

const viewQuery = () =>
  db
    .select(bookingView)
    .from(schema.bookings)
    .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
    .innerJoin(schema.staff, eq(schema.staff.id, schema.bookings.staffId))
    .innerJoin(schema.user, eq(schema.user.id, schema.bookings.customerId))
    .$dynamic();

export async function getBooking(user: AppUser, id: string) {
  const [row] = await viewQuery().where(eq(schema.bookings.id, id)).limit(1);
  if (!row || (!isTeam(user) && row.customerId !== user.id)) throw notFound("Booking");
  return row;
}

export async function listMyBookings(user: AppUser) {
  const rows = await viewQuery()
    .where(and(eq(schema.bookings.customerId, user.id), inArray(schema.bookings.status, ["confirmed", "cancelled", "completed", "no_show"])))
    .orderBy(asc(schema.bookings.startsAt));
  const now = Date.now();
  return {
    upcoming: rows.filter((r) => r.status === "confirmed" && r.endsAt.getTime() > now),
    past: rows.filter((r) => !(r.status === "confirmed" && r.endsAt.getTime() > now)).reverse(),
  };
}

/** Team calendar for one local day: all staff columns and every non-cancelled booking. */
export async function dayAgenda(date: DateStr) {
  const b = await getBusiness();
  const { start, end } = dayBounds(date, b.timezone);
  const [rows, staff, rules] = await Promise.all([
    viewQuery()
      .where(
        and(
          gte(schema.bookings.startsAt, start),
          lt(schema.bookings.startsAt, end),
          inArray(schema.bookings.status, ["held", "confirmed", "completed", "no_show"]),
        ),
      )
      .orderBy(asc(schema.bookings.startsAt)),
    listStaff(),
    db.select().from(schema.availabilityRules),
  ]);
  const now = Date.now();
  const bookings = rows.filter((r) => r.status !== "held" || (r.holdExpiresAt && r.holdExpiresAt.getTime() > now));
  return { timezone: b.timezone, staff, rules, bookings };
}

export async function bookingHistory(bookingId: string) {
  return db.select().from(schema.activity).where(eq(schema.activity.bookingId, bookingId)).orderBy(desc(schema.activity.createdAt)).limit(20);
}

export async function listActivity(limit = 50) {
  return db
    .select({ id: schema.activity.id, type: schema.activity.type, summary: schema.activity.summary, createdAt: schema.activity.createdAt, bookingId: schema.activity.bookingId })
    .from(schema.activity)
    .orderBy(desc(schema.activity.createdAt))
    .limit(limit);
}

export async function listNotifications(user: AppUser, limit = 20) {
  const [items, [unread]] = await Promise.all([
    db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id)).orderBy(desc(schema.notifications.createdAt)).limit(limit),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, user.id), sql`${schema.notifications.readAt} is null`)),
  ]);
  return { items, unread: unread?.n ?? 0 };
}

export async function markNotificationsRead(user: AppUser) {
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, user.id), sql`${schema.notifications.readAt} is null`));
}
