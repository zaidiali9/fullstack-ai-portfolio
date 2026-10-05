import { describe, expect, it } from "vitest";
import { computeSlots, nearestAlternatives } from "@/server/scheduling/slots";
import { addDays, dateInTz, dayBounds, minutesInTz, weekdayOf, zonedToUtc } from "@/server/scheduling/time";

const TZ = "America/New_York";
const base = {
  date: "2026-10-07", // Wednesday
  timezone: TZ,
  windows: [{ startMin: 9 * 60, endMin: 12 * 60 }],
  durationMin: 60,
  bufferMin: 0,
  intervalMin: 30,
  busy: [],
  now: new Date("2026-10-01T00:00:00Z"),
  minNoticeMin: 60,
};
const hhmm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);

describe("time helpers (timezone-aware)", () => {
  it("converts local wall time to UTC, including across DST", () => {
    expect(zonedToUtc("2026-10-07", 9 * 60, TZ).toISOString()).toBe("2026-10-07T13:00:00.000Z"); // EDT, UTC-4
    expect(zonedToUtc("2026-11-04", 9 * 60, TZ).toISOString()).toBe("2026-11-04T14:00:00.000Z"); // EST, UTC-5
  });
  it("computes day bounds, weekday and local minutes", () => {
    const b = dayBounds("2026-11-01", TZ); // DST ends: a 25-hour day
    expect((b.end.getTime() - b.start.getTime()) / 3_600_000).toBe(25);
    expect(weekdayOf("2026-10-07")).toBe(3);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dateInTz(new Date("2026-10-08T02:30:00Z"), TZ)).toBe("2026-10-07");
    expect(minutesInTz(new Date("2026-10-07T13:15:00Z"), TZ)).toBe(9 * 60 + 15);
  });
});

describe("computeSlots", () => {
  it("lists aligned slots that fit inside the working window", () => {
    expect(computeSlots(base).map(hhmm)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });
  it("aligns to the grid when the window starts off-grid", () => {
    expect(computeSlots({ ...base, windows: [{ startMin: 9 * 60 + 10, endMin: 11 * 60 }] }).map(hhmm)).toEqual(["09:30", "10:00"]);
  });
  it("skips slots that overlap busy time, including the clean-up buffer", () => {
    const busy = [{ start: zonedToUtc(base.date, 10 * 60, TZ).getTime(), end: zonedToUtc(base.date, 11 * 60, TZ).getTime() }];
    expect(computeSlots({ ...base, busy }).map(hhmm)).toEqual(["09:00", "11:00"]);
    // With a 30-minute buffer, 09:00 (busy until 10:30) collides with the 10:00 booking.
    expect(computeSlots({ ...base, busy, bufferMin: 30 }).map(hhmm)).toEqual(["11:00"]);
  });
  it("allows back-to-back appointments (half-open intervals)", () => {
    const busy = [{ start: zonedToUtc(base.date, 9 * 60, TZ).getTime(), end: zonedToUtc(base.date, 10 * 60, TZ).getTime() }];
    expect(computeSlots({ ...base, busy }).map(hhmm)[0]).toBe("10:00");
  });
  it("respects minimum notice", () => {
    const now = zonedToUtc(base.date, 8 * 60 + 45, TZ);
    expect(computeSlots({ ...base, now }).map(hhmm)).toEqual(["10:00", "10:30", "11:00"]);
  });
  it("handles split shifts and returns nothing on days off", () => {
    const windows = [
      { startMin: 13 * 60, endMin: 15 * 60 },
      { startMin: 9 * 60, endMin: 10 * 60 },
    ];
    expect(computeSlots({ ...base, windows }).map(hhmm)).toEqual(["09:00", "13:00", "13:30", "14:00"]);
    expect(computeSlots({ ...base, windows: [] })).toEqual([]);
  });
});

describe("nearestAlternatives", () => {
  it("returns the k closest times, in chronological order", () => {
    const t = (h: number) => ({ start: zonedToUtc(base.date, h * 60, TZ), staffId: "s" });
    const alts = nearestAlternatives(zonedToUtc(base.date, 11 * 60, TZ), [t(9), t(10), t(12), t(15), t(16)], 3);
    expect(alts.map((a) => hhmm(a.start))).toEqual(["09:00", "10:00", "12:00"]);
  });
});
