import { zonedToUtc, type DateStr } from "./time";

export interface Interval {
  start: number; // epoch ms, inclusive
  end: number; // epoch ms, exclusive
}

export interface SlotInput {
  date: DateStr;
  timezone: string;
  /** Working windows that day, in minutes from local midnight. */
  windows: { startMin: number; endMin: number }[];
  durationMin: number;
  bufferMin: number;
  intervalMin: number;
  /** Existing commitments: bookings ([starts_at, blocked_until)) and time off. */
  busy: Interval[];
  now: Date;
  minNoticeMin: number;
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/**
 * Bookable start times for one staff member on one day.
 * A slot fits if the appointment [start, start+duration) lies inside a working window, starts after
 * the minimum notice, and [start, start+duration+buffer) doesn't overlap any busy interval —
 * the same range the database exclusion constraint checks, so the UI and the DB agree.
 */
export function computeSlots(input: SlotInput): Date[] {
  const earliest = input.now.getTime() + input.minNoticeMin * 60_000;
  const out: Date[] = [];
  for (const w of [...input.windows].sort((a, b) => a.startMin - b.startMin)) {
    // Align to the slot grid relative to midnight (e.g. :00, :15, :30, :45).
    const first = Math.ceil(w.startMin / input.intervalMin) * input.intervalMin;
    for (let t = first; t + input.durationMin <= w.endMin; t += input.intervalMin) {
      const start = zonedToUtc(input.date, t, input.timezone).getTime();
      if (start < earliest) continue;
      const blocked: Interval = { start, end: start + (input.durationMin + input.bufferMin) * 60_000 };
      if (input.busy.some((b) => overlaps(blocked, b))) continue;
      out.push(new Date(start));
    }
  }
  return out;
}

/** Nearest free alternatives to a requested time (used when a slot was just taken). */
export function nearestAlternatives(requested: Date, candidates: { start: Date; staffId: string }[], k = 3) {
  return [...candidates]
    .sort((a, b) => Math.abs(a.start.getTime() - requested.getTime()) - Math.abs(b.start.getTime() - requested.getTime()))
    .slice(0, k)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}
