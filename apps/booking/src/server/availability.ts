import "server-only";
import { and, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getBusiness, type ServiceWithStaff } from "./catalog";
import { computeSlots, type Interval } from "./scheduling/slots";
import { addDays, dateInTz, dayBounds, minutesInTz, weekdayOf, type DateStr } from "./scheduling/time";

export interface Opening {
  start: Date;
  staffId: string;
}

/** Bookings that currently block time: confirmed, or held with an unexpired hold. */
export const blockingStatus = () =>
  or(
    eq(schema.bookings.status, "confirmed"),
    and(eq(schema.bookings.status, "held"), gt(schema.bookings.holdExpiresAt, sql`now()`)),
  );

export function today(tz: string, now = new Date()): DateStr {
  return dateInTz(now, tz);
}

/** Is the date inside the bookable window (today … horizon)? */
export async function inHorizon(date: DateStr, now = new Date()) {
  const b = await getBusiness();
  const t = today(b.timezone, now);
  return date >= t && date <= addDays(t, b.bookingHorizonDays);
}

/**
 * Open start times for a service on [fromDate, toDate], optionally for one staff member.
 * `ignoreBookingId` lets a reschedule see its own current slot as free.
 */
export async function findOpenings(opts: {
  service: ServiceWithStaff;
  staffId?: string | null;
  fromDate: DateStr;
  toDate: DateStr;
  ignoreBookingId?: string;
  now?: Date;
}): Promise<Opening[]> {
  const b = await getBusiness();
  const now = opts.now ?? new Date();
  const t = today(b.timezone, now);
  const from = opts.fromDate < t ? t : opts.fromDate;
  const lastDay = addDays(t, b.bookingHorizonDays);
  const to = opts.toDate > lastDay ? lastDay : opts.toDate;
  if (from > to) return [];

  const staffIds = opts.staffId ? opts.service.staffIds.filter((id) => id === opts.staffId) : opts.service.staffIds;
  if (staffIds.length === 0) return [];
  const range = { start: dayBounds(from, b.timezone).start, end: dayBounds(to, b.timezone).end };

  const [rules, busyBookings, off] = await Promise.all([
    db.select().from(schema.availabilityRules).where(inArray(schema.availabilityRules.staffId, staffIds)),
    db
      .select({ staffId: schema.bookings.staffId, start: schema.bookings.startsAt, end: schema.bookings.blockedUntil })
      .from(schema.bookings)
      .where(
        and(
          inArray(schema.bookings.staffId, staffIds),
          blockingStatus(),
          lt(schema.bookings.startsAt, range.end),
          gt(schema.bookings.blockedUntil, range.start),
          opts.ignoreBookingId ? ne(schema.bookings.id, opts.ignoreBookingId) : undefined,
        ),
      ),
    db
      .select({ staffId: schema.timeOff.staffId, start: schema.timeOff.startsAt, end: schema.timeOff.endsAt })
      .from(schema.timeOff)
      .where(and(inArray(schema.timeOff.staffId, staffIds), lt(schema.timeOff.startsAt, range.end), gt(schema.timeOff.endsAt, range.start))),
  ]);

  const busyBy = new Map<string, Interval[]>();
  for (const r of [...busyBookings, ...off]) {
    const list = busyBy.get(r.staffId) ?? [];
    list.push({ start: r.start.getTime(), end: r.end.getTime() });
    busyBy.set(r.staffId, list);
  }

  const out: Opening[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = weekdayOf(d);
    for (const staffId of staffIds) {
      const windows = rules.filter((r) => r.staffId === staffId && r.weekday === wd);
      if (windows.length === 0) continue;
      for (const start of computeSlots({
        date: d,
        timezone: b.timezone,
        windows,
        durationMin: opts.service.durationMin,
        bufferMin: opts.service.bufferMin,
        intervalMin: b.slotIntervalMin,
        busy: busyBy.get(staffId) ?? [],
        now,
        minNoticeMin: b.minNoticeMin,
      })) {
        out.push({ start, staffId });
      }
    }
  }
  return out.sort((a, b2) => a.start.getTime() - b2.start.getTime() || a.staffId.localeCompare(b2.staffId));
}

/** Slots for one day, merged across staff: each time lists who is free. */
export async function daySlots(opts: { service: ServiceWithStaff; staffId?: string | null; date: DateStr }) {
  const openings = await findOpenings({ ...opts, fromDate: opts.date, toDate: opts.date });
  const byTime = new Map<number, string[]>();
  for (const o of openings) byTime.set(o.start.getTime(), [...(byTime.get(o.start.getTime()) ?? []), o.staffId]);
  return [...byTime.entries()].map(([t, staffIds]) => ({ start: new Date(t).toISOString(), staffIds }));
}

/** Days in the window that have at least one opening (for the date strip). */
export async function daysWithOpenings(opts: { service: ServiceWithStaff; staffId?: string | null; fromDate: DateStr; days: number }) {
  const b = await getBusiness();
  const openings = await findOpenings({ ...opts, toDate: addDays(opts.fromDate, opts.days - 1) });
  const counts = new Map<DateStr, number>();
  for (const o of openings) {
    const d = dateInTz(o.start, b.timezone);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return counts;
}

export interface TimeWindow {
  /** Minutes from local midnight, inclusive. */
  fromMin: number;
  /** Minutes from local midnight, exclusive (applies to the start time). */
  toMin: number;
}

/** Filter openings by local start time, keeping at most `perDay` per day and `limit` overall. */
export async function pickOpenings(openings: Opening[], opts: { window?: TimeWindow | null; perDay?: number; limit?: number }) {
  const b = await getBusiness();
  const perDay = new Map<string, number>();
  const seen = new Set<number>();
  const out: Opening[] = [];
  for (const o of openings) {
    const m = minutesInTz(o.start, b.timezone);
    if (opts.window && (m < opts.window.fromMin || m >= opts.window.toMin)) continue;
    if (seen.has(o.start.getTime())) continue; // one option per time, whichever staff sorts first
    const d = dateInTz(o.start, b.timezone);
    if ((perDay.get(d) ?? 0) >= (opts.perDay ?? Infinity)) continue;
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
    seen.add(o.start.getTime());
    out.push(o);
    if (out.length >= (opts.limit ?? 6)) break;
  }
  return out;
}

