import { beforeAll, describe, expect, it } from "vitest";
import { readTextStream, streamResponse } from "@portfolio/ai";
import { HttpError } from "@portfolio/kit";
import { db, schema } from "@/db";
import { digestStats, searchFromRequest, streamDigest } from "@/server/ai/features";
import { addDays, dateInTz, minutesInTz, zonedToUtc } from "@/server/scheduling/time";
import { BUSINESS } from "@db/seed-data";
import { makeUser, studio } from "./factories";

type Studio = Awaited<ReturnType<typeof studio>>;
let s: Studio;
const tz = BUSINESS.timezone;

beforeAll(async () => {
  s = await studio();
});

describe("natural-language search (stub AI)", () => {
  it("maps the request to the catalog and returns real openings in the requested window (stub AI)", async () => {
    const r = await searchFromRequest("t1", { request: "deep tissue with Sam next week in the morning" }, s.customer.id);
    expect(r.interpretation.service?.slug).toBe("deep-tissue-massage");
    expect(r.interpretation.staff?.name).toBe("Sam Rivera");
    expect(r.interpretation.dates).toMatchObject({ label: "next week", explicit: true });
    expect(r.interpretation.time).toBe("before 12pm");
    expect(r.model.provider).toBe("stub");
    expect(r.options.length).toBeGreaterThan(0);
    expect(r.options.length).toBeLessThanOrEqual(6);
    for (const o of r.options) {
      expect(o.staffId).toBe(s.staff.sam.id);
      expect(minutesInTz(new Date(o.start), tz)).toBeLessThan(12 * 60);
      const d = dateInTz(new Date(o.start), tz);
      expect(d >= r.interpretation.dates.from && d <= r.interpretation.dates.to).toBe(true);
    }
    // Usage is logged for cost tracking.
    const usage = await db.select().from(schema.aiUsage);
    expect(usage.some((u) => u.feature === "nl_search" && u.provider === "stub")).toBe(true);
  });

  it("asks for a service when the request doesn't name one, without searching (stub AI)", async () => {
    const r = await searchFromRequest("t2", { request: "anything tomorrow afternoon?" });
    expect(r.interpretation.service).toBeNull();
    expect(r.options).toEqual([]);
    expect(r.notes.join(" ")).toMatch(/pick one/);
  });

  it("falls back to the next available times when the requested day is closed (stub AI)", async () => {
    // Sam never works Sundays.
    let sunday = dateInTz(new Date(), tz);
    while (new Date(`${sunday}T12:00:00Z`).getUTCDay() !== 0) sunday = addDays(sunday, 1);
    const r = await searchFromRequest("t3", { request: `deep tissue massage with Sam on ${sunday}` });
    expect(r.notes.join(" ")).toMatch(/Nothing open/);
    expect(r.options.length).toBeGreaterThan(0);
    expect(r.options.every((o) => dateInTz(new Date(o.start), tz) > sunday)).toBe(true);
  });

  it("validates input length and rate limits per caller (stub AI)", async () => {
    await expect(searchFromRequest("t4", { request: "x".repeat(301) })).rejects.toThrow();
    await expect(searchFromRequest("t4", { request: "hi" })).rejects.toThrow();
    const results = await Promise.allSettled(Array.from({ length: 11 }, () => searchFromRequest("burst", { request: "a facial please" })));
    const limited = results.filter((r) => r.status === "rejected" && r.reason instanceof HttpError && r.reason.status === 429);
    expect(limited.length).toBeGreaterThan(0);
  });
});

describe("weekly digest", () => {
  it("computes stats deterministically from bookings", async () => {
    const owner = await makeUser("owner");
    const today = dateInTz(new Date(), tz);
    const yesterday = addDays(today, -1);
    const svc = s.svc("assisted-stretch");
    const mk = (date: string, hh: number, status: "completed" | "no_show" | "cancelled", ref: string) => ({
      reference: ref,
      serviceId: svc.id,
      staffId: s.staff.alex.id,
      customerId: owner.id,
      startsAt: zonedToUtc(date, hh * 60, tz),
      endsAt: zonedToUtc(date, hh * 60 + 30, tz),
      blockedUntil: zonedToUtc(date, hh * 60 + 30, tz),
      status,
      priceCents: 4500,
    });
    await db.insert(schema.bookings).values([mk(yesterday, 6, "completed", "BK-DIG001"), mk(yesterday, 7, "completed", "BK-DIG002"), mk(yesterday, 8, "no_show", "BK-DIG003"), mk(yesterday, 9, "cancelled", "BK-DIG004")]);
    const stats = await digestStats();
    expect(stats.past7).toMatchObject({ completed: 2, noShows: 1, cancellations: 1, appointments: 3, bookedValueUsd: 90 });
    expect(stats.past7.topService).toEqual({ name: "Assisted stretch", count: 3 });
    expect(stats.next7.byStaff.map((p) => p.name)).toEqual(["Alex Chen", "Priya Nair", "Sam Rivera"]);
    for (const p of stats.next7.byStaff) expect(p.utilizationPct).toBeGreaterThanOrEqual(0);
  });

  it("streams a narrative with a number-check trailer (stub AI)", async () => {
    const owner = await makeUser("owner");
    const { stream } = await streamDigest(owner);
    const res = await streamResponse(stream, { onEarlyError: () => new Response("x", { status: 500 }), trailer: (m) => m });
    let meta: unknown;
    const text = await readTextStream(res, () => {}, (m) => (meta = m));
    expect(text).toContain("[stub]");
    expect(meta).toEqual({ unverified: [], provider: "stub", model: "stub-model" });
  });
});
