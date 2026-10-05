import { TZDate } from "@date-fns/tz";

/** Calendar date in the business timezone, "YYYY-MM-DD". */
export type DateStr = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(d: DateStr): { y: number; m: number; d: number } {
  const m = DATE_RE.exec(d);
  if (!m) throw new Error(`Invalid date: ${d}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** The UTC instant for a wall-clock time on a date in a timezone (DST-correct). */
export function zonedToUtc(date: DateStr, minutesFromMidnight: number, tz: string): Date {
  const { y, m, d } = parseDate(date);
  const h = Math.floor(minutesFromMidnight / 60);
  const min = minutesFromMidnight % 60;
  return new Date(new TZDate(y, m - 1, d, h, min, 0, tz).getTime());
}

/** Calendar date (in tz) of an instant. */
export function dateInTz(instant: Date, tz: string): DateStr {
  const z = new TZDate(instant.getTime(), tz);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
}

/** Weekday (0 = Sunday) of a calendar date. */
export function weekdayOf(date: DateStr): number {
  const { y, m, d } = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: DateStr, days: number): DateStr {
  const { y, m, d } = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** [start, end) UTC instants covering a whole local day. */
export function dayBounds(date: DateStr, tz: string): { start: Date; end: Date } {
  return { start: zonedToUtc(date, 0, tz), end: zonedToUtc(addDays(date, 1), 0, tz) };
}

/** Minutes from local midnight for an instant (used to apply time-of-day filters). */
export function minutesInTz(instant: Date, tz: string): number {
  const z = new TZDate(instant.getTime(), tz);
  return z.getHours() * 60 + z.getMinutes();
}

export function formatTime(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(instant);
}

export function formatDateLong(date: DateStr): string {
  const { y, m, d } = parseDate(date);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
