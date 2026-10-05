import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { HttpError } from "@portfolio/kit";
import { db, schema } from "@/db";
import { daySlots, findOpenings } from "@/server/availability";
import {
  cancelBooking,
  confirmBooking,
  dayAgenda,
  getBooking,
  holdSlot,
  isOverlap,
  listActivity,
  listMyBookings,
  listNotifications,
  markNotificationsRead,
  pgCode,
  rescheduleBooking,
  setOutcome,
} from "@/server/bookings";
import { listenerCount, sseResponse, subscribe, type BookingEvent } from "@/server/realtime";
import { zonedToUtc } from "@/server/scheduling/time";
import { BUSINESS } from "@db/seed-data";
import { makeUser, nextDate, studio } from "./factories";

type Studio = Awaited<ReturnType<typeof studio>>;
let s: Studio;
// Sam works Mon, Tue, Thu 9-17 — pick a Monday so times are predictable.
let day: string;
const at = (hhmm: string, date = day) => zonedToUtc(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), BUSINESS.timezone).toISOString();

async function expectHttp(p: Promise<unknown>, status: number, code?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpError);
  expect((err as HttpError).status).toBe(status);
  if (code) expect((err as HttpError).code).toBe(code);
  return err as HttpError;
}

beforeAll(async () => {
  s = await studio();
  day = nextDate((wd) => wd === 1);
});

const book = async (user = s.customer, start = at("10:00"), slug = "deep-tissue-massage", staffId: string = s.staff.sam.id) => {
  const held = await holdSlot(user, { serviceId: s.svc(slug).id, staffId, start });
  return confirmBooking(user, { bookingId: held.id, notes: "" });
};

describe("availability", () => {
  it("lists slots inside working hours and hides booked time plus buffer", async () => {
    const service = s.svc("deep-tissue-massage"); // 60 min + 15 min buffer
    const before = await daySlots({ service, staffId: s.staff.sam.id, date: day });
    expect(before[0]!.start).toBe(at("09:00"));
    expect(before.at(-1)!.start).toBe(at("16:00")); // last 60-min start before 17:00
    const bk = await book(s.customer, at("11:00"));
    const after = (await daySlots({ service, staffId: s.staff.sam.id, date: day })).map((x) => x.start);
    // 10:00 + 60 min + 15 min buffer runs to 11:15, overlapping the 11:00 booking, so it's hidden.
    expect(after).not.toContain(at("10:00"));
    expect(after).not.toContain(at("11:00"));
    expect(after).toContain(at("12:15")); // 11:00 booking blocks until 12:15
    expect(after).not.toContain(at("12:00"));
    await cancelBooking(s.customer, { bookingId: bk.id, version: bk.version });
  });

  it("merges staff for 'any' and returns nothing outside the horizon or on days off", async () => {
    const swedish = s.svc("swedish-massage"); // Sam and Priya
    const tuesday = nextDate((wd) => wd === 2);
    const slots = await daySlots({ service: swedish, date: tuesday });
    expect(slots.find((x) => x.start === at("10:00", tuesday))!.staffIds).toHaveLength(2);
    const sunday = nextDate((wd) => wd === 0);
    expect(await daySlots({ service: swedish, date: sunday })).toEqual([]);
    expect(await findOpenings({ service: swedish, fromDate: "2099-01-01", toDate: "2099-01-02" })).toEqual([]);
  });
});

describe("hold and confirm", () => {
  it("holds, confirms, notifies the team and records activity", async () => {
    const held = await holdSlot(s.customer, { serviceId: s.svc("deep-tissue-massage").id, staffId: s.staff.sam.id, start: at("13:00") });
    expect(held.status).toBe("held");
    expect(held.reference).toMatch(/^BK-[A-Z2-9]{6}$/);
    expect(held.holdExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    const confirmed = await confirmBooking(s.customer, { bookingId: held.id, notes: "Left shoulder" });
    expect(confirmed).toMatchObject({ status: "confirmed", version: 2, notes: "Left shoulder", holdExpiresAt: null });
    // Double submit is idempotent.
    expect((await confirmBooking(s.customer, { bookingId: held.id })).id).toBe(held.id);
    const ownerInbox = await listNotifications(s.owner);
    const samInbox = await listNotifications(s.samUser);
    expect(ownerInbox.items.some((n) => n.bookingId === held.id)).toBe(true);
    expect(samInbox.unread).toBeGreaterThan(0);
    await markNotificationsRead(s.samUser);
    expect((await listNotifications(s.samUser)).unread).toBe(0);
    expect((await listActivity()).some((a) => a.bookingId === held.id && a.type === "booking.confirmed")).toBe(true);
    expect((await listMyBookings(s.customer)).upcoming.map((b) => b.id)).toContain(held.id);
  });

  it("does not let another customer see or confirm someone else's hold", async () => {
    const held = await holdSlot(s.customer, { serviceId: s.svc("assisted-stretch").id, staffId: "any", start: at("15:00") });
    await expectHttp(confirmBooking(s.other, { bookingId: held.id }), 404);
    await expectHttp(getBooking(s.other, held.id), 404);
    expect((await getBooking(s.owner, held.id)).id).toBe(held.id);
  });

  it("keeps one active hold per customer", async () => {
    const service = s.svc("signature-facial");
    const tuesday = nextDate((wd) => wd === 2);
    const a = await holdSlot(s.other, { serviceId: service.id, staffId: "any", start: at("10:00", tuesday) });
    const b = await holdSlot(s.other, { serviceId: service.id, staffId: "any", start: at("11:00", tuesday) });
    const [gone] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, a.id));
    expect(gone).toBeUndefined();
    expect(b.status).toBe("held");
    // Regression: a customer's own earlier hold must not block their new pick at an overlapping time.
    const facialAt11 = await holdSlot(s.other, { serviceId: service.id, staffId: b.staffId, start: at("11:00", tuesday) });
    expect(facialAt11.staffId).toBe(b.staffId);
  });

  it("rejects an expired hold at confirm time and frees the slot", async () => {
    const held = await holdSlot(s.customer, { serviceId: s.svc("deep-tissue-massage").id, staffId: s.staff.sam.id, start: at("15:00") });
    await db.update(schema.bookings).set({ holdExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.bookings.id, held.id));
    await expectHttp(confirmBooking(s.customer, { bookingId: held.id }), 409, "hold_expired");
    // The expired hold no longer blocks anyone.
    const again = await holdSlot(s.other, { serviceId: s.svc("deep-tissue-massage").id, staffId: s.staff.sam.id, start: at("15:00") });
    expect(again.status).toBe("held");
    await db.delete(schema.bookings).where(eq(schema.bookings.id, again.id));
  });

  it("validates input and staff/service pairing", async () => {
    await expect(holdSlot(s.customer, { serviceId: "nope", staffId: "any", start: at("09:00") })).rejects.toThrow();
    await expectHttp(holdSlot(s.customer, { serviceId: s.svc("signature-facial").id, staffId: s.staff.sam.id, start: at("09:00") }), 400);
  });

  it("refuses a time outside working hours with alternatives", async () => {
    const err = await expectHttp(holdSlot(s.customer, { serviceId: s.svc("deep-tissue-massage").id, staffId: s.staff.sam.id, start: at("07:00") }), 409, "conflict");
    const alts = (err.details as { alternatives: { start: string; staffName: string }[] }).alternatives;
    expect(alts.length).toBeGreaterThan(0);
    expect(alts[0]!.staffName).toBe("Sam Rivera");
  });
});

describe("double-booking protection", () => {
  it("the database exclusion constraint rejects overlapping bookings even when app checks are bypassed", async () => {
    const base = { serviceId: s.svc("assisted-stretch").id, staffId: s.staff.alex.id, customerId: s.customer.id, priceCents: 4500, status: "confirmed" as const };
    const wed = nextDate((wd) => wd === 3);
    await db.insert(schema.bookings).values({ ...base, reference: "BK-TEST01", startsAt: new Date(at("09:00", wed)), endsAt: new Date(at("09:30", wed)), blockedUntil: new Date(at("09:30", wed)) });
    const err = await db
      .insert(schema.bookings)
      .values({ ...base, reference: "BK-TEST02", startsAt: new Date(at("09:15", wed)), endsAt: new Date(at("09:45", wed)), blockedUntil: new Date(at("09:45", wed)) })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(pgCode(err)).toBe("23P01");
    expect(isOverlap(err)).toBe(true);
    // Back-to-back is fine (half-open ranges), and cancelled rows don't block.
    await db.insert(schema.bookings).values({ ...base, reference: "BK-TEST03", startsAt: new Date(at("09:30", wed)), endsAt: new Date(at("10:00", wed)), blockedUntil: new Date(at("10:00", wed)) });
    await db.insert(schema.bookings).values({ ...base, status: "cancelled", reference: "BK-TEST04", startsAt: new Date(at("09:00", wed)), endsAt: new Date(at("09:30", wed)), blockedUntil: new Date(at("09:30", wed)) });
  });

  it("two customers racing for the same staff and time: exactly one wins, the other gets alternatives", async () => {
    const thursday = nextDate((wd) => wd === 4);
    const input = { serviceId: s.svc("deep-tissue-massage").id, staffId: s.staff.sam.id, start: at("10:00", thursday) };
    const racers = await Promise.all(Array.from({ length: 4 }, (_, i) => makeUser("customer", `Racer ${i}`)));
    const results = await Promise.allSettled(racers.map((u) => holdSlot(u, input)));
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(3);
    for (const l of lost) {
      expect(l.reason).toBeInstanceOf(HttpError);
      expect((l.reason as HttpError).status).toBe(409);
    }
  });

  it("with 'any staff', simultaneous requests are spread across free staff", async () => {
    const tuesday = nextDate((wd) => wd === 2, 8);
    const input = { serviceId: s.svc("swedish-massage").id, staffId: "any", start: at("14:00", tuesday) };
    const [a, b] = await Promise.all([makeUser(), makeUser()]);
    const [ha, hb] = await Promise.all([holdSlot(a, input), holdSlot(b, input)]);
    expect(new Set([ha.staffId, hb.staffId]).size).toBe(2);
    const c = await makeUser();
    await expectHttp(holdSlot(c, input), 409);
  });
});

describe("cancel, reschedule and outcomes", () => {
  it("cancels with optimistic concurrency and notifies the customer when the studio cancels", async () => {
    const bk = await book(s.customer, at("09:00", nextDate((wd) => wd === 1, 9)));
    await expectHttp(cancelBooking(s.customer, { bookingId: bk.id, version: bk.version - 1 }), 409, "stale");
    await expectHttp(cancelBooking(s.other, { bookingId: bk.id, version: bk.version }), 404);
    const cancelled = await cancelBooking(s.owner, { bookingId: bk.id, version: bk.version });
    expect(cancelled.status).toBe("cancelled");
    expect((await listNotifications(s.customer)).items[0]!.title).toBe("Booking cancelled");
    await expectHttp(cancelBooking(s.owner, { bookingId: bk.id, version: cancelled.version }), 409, "not_active");
  });

  it("blocks customer cancellation inside the minimum notice window (team can still cancel)", async () => {
    const bk = await book(s.customer, at("11:00", nextDate((wd) => wd === 4, 9)));
    await db.update(schema.bookings).set({ startsAt: new Date(Date.now() + 30 * 60_000), endsAt: new Date(Date.now() + 90 * 60_000), blockedUntil: new Date(Date.now() + 105 * 60_000) }).where(eq(schema.bookings.id, bk.id));
    await expectHttp(cancelBooking(s.customer, { bookingId: bk.id, version: bk.version }), 422, "too_late");
    expect((await cancelBooking(s.samUser, { bookingId: bk.id, version: bk.version })).status).toBe("cancelled");
  });

  it("reschedules in place, keeps the reference and bumps the version", async () => {
    const monday = nextDate((wd) => wd === 1, 16);
    const bk = await book(s.customer, at("09:00", monday));
    const moved = await rescheduleBooking(s.customer, { bookingId: bk.id, version: bk.version, start: at("14:00", monday), staffId: "any" });
    expect(moved).toMatchObject({ id: bk.id, reference: bk.reference, version: bk.version + 1, staffId: s.staff.sam.id });
    expect(moved.startsAt.toISOString()).toBe(at("14:00", monday));
    // Moving by 15 minutes overlaps its own old slot — allowed because the booking ignores itself.
    const nudged = await rescheduleBooking(s.customer, { bookingId: bk.id, version: moved.version, start: at("14:15", monday), staffId: s.staff.sam.id });
    expect(nudged.version).toBe(moved.version + 1);
    await expectHttp(rescheduleBooking(s.customer, { bookingId: bk.id, version: moved.version, start: at("15:30", monday) }), 409, "stale");
    // Into someone else's slot -> 409 with alternatives.
    const blocker = await book(s.other, at("11:00", monday));
    const err = await expectHttp(rescheduleBooking(s.customer, { bookingId: bk.id, version: nudged.version, start: at("11:00", monday), staffId: s.staff.sam.id }), 409, "conflict");
    expect((err.details as { alternatives: unknown[] }).alternatives.length).toBeGreaterThan(0);
    expect(blocker.status).toBe("confirmed");
  });

  it("only the team can mark outcomes, and only after the start time", async () => {
    const bk = await book(s.customer, at("12:00", nextDate((wd) => wd === 1, 23)));
    await expectHttp(setOutcome(s.customer, { bookingId: bk.id, version: bk.version, status: "completed" }), 403);
    await expectHttp(setOutcome(s.owner, { bookingId: bk.id, version: bk.version, status: "completed" }), 422, "not_started");
    await db.update(schema.bookings).set({ startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() - 60_000), blockedUntil: new Date(Date.now() - 60_000) }).where(eq(schema.bookings.id, bk.id));
    const done = await setOutcome(s.owner, { bookingId: bk.id, version: bk.version, status: "no_show" });
    expect(done.status).toBe("no_show");
    expect((await listMyBookings(s.customer)).past.some((b) => b.id === bk.id)).toBe(true);
  });
});

describe("realtime", () => {
  it("publishes booking events through LISTEN/NOTIFY after commit", async () => {
    const events: BookingEvent[] = [];
    const unsubscribe = await subscribe((e) => events.push(e));
    const friday = nextDate((wd) => wd === 5, 3);
    const bk = await book(await makeUser(), at("09:00", friday));
    await new Promise((r) => setTimeout(r, 50));
    unsubscribe();
    const mine = events.filter((e) => e.bookingId === bk.id).map((e) => e.action);
    expect(mine).toEqual(["held", "confirmed"]);
    expect(events.find((e) => e.bookingId === bk.id)!.dates).toEqual([friday]);
  });

  it("streams filtered events as Server-Sent Events and cleans up on disconnect", async () => {
    const ctrl = new AbortController();
    const res = sseResponse(new Request("http://localhost/api/stream", { signal: ctrl.signal }), (ev) => (ev.action === "held" ? null : { dates: ev.dates }));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const read = async () => decoder.decode((await reader.read()).value);
    expect(await read()).toContain("event: ready");
    const before = listenerCount();
    const friday = nextDate((wd) => wd === 5, 10);
    await book(await makeUser(), at("10:00", friday)); // "held" is filtered out, "confirmed" is sent
    const chunk = await read();
    expect(chunk).toBe(`event: booking\ndata: ${JSON.stringify({ dates: [friday] })}\n\n`);
    ctrl.abort();
    await new Promise((r) => setTimeout(r, 10));
    expect(listenerCount()).toBe(before - 1);
  });

  it("builds the team day agenda with staff columns", async () => {
    const monday = nextDate((wd) => wd === 1);
    const agenda = await dayAgenda(monday);
    expect(agenda.staff.map((p) => p.name)).toEqual(["Alex Chen", "Priya Nair", "Sam Rivera"]);
    expect(agenda.timezone).toBe(BUSINESS.timezone);
    expect(agenda.bookings.every((b) => b.status !== "held" || (b.holdExpiresAt && b.holdExpiresAt > new Date()))).toBe(true);
  });
});
