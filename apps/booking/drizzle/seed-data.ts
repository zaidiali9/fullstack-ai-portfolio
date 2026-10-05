/**
 * SEED DATA for the fictional "Lumen Wellness Studio". Every name, service, price and booking here
 * is invented for the demo — none of it describes a real business, person or appointment.
 */
import { computeSlots, type Interval } from "../src/server/scheduling/slots";
import { addDays, dateInTz, weekdayOf } from "../src/server/scheduling/time";
import * as schema from "./schema";
import type { Database } from "@portfolio/kit/db";

type DB = Database<typeof schema>;

export const BUSINESS = {
  name: "Lumen Wellness Studio",
  timezone: "America/New_York",
  slotIntervalMin: 15,
  bookingHorizonDays: 30,
  minNoticeMin: 60,
};

export const SERVICES = [
  { slug: "swedish-massage", name: "Swedish massage", durationMin: 60, bufferMin: 15, priceCents: 9500, description: "Long, flowing strokes for relaxation and everyday stress relief." },
  { slug: "deep-tissue-massage", name: "Deep tissue massage", durationMin: 60, bufferMin: 15, priceCents: 11500, description: "Firm, focused pressure for stubborn knots, tight shoulders and sports soreness." },
  { slug: "signature-facial", name: "Signature facial", durationMin: 50, bufferMin: 10, priceCents: 8500, description: "Cleanse, gentle exfoliation, mask and hydration tailored to your skin." },
  { slug: "acupuncture", name: "Acupuncture session", durationMin: 45, bufferMin: 15, priceCents: 9000, description: "Fine-needle session often chosen for tension, headaches and winding down." },
  { slug: "assisted-stretch", name: "Assisted stretch", durationMin: 30, bufferMin: 0, priceCents: 4500, description: "A quick one-on-one stretching session to loosen up after training or a long day at a desk." },
] as const;

const h = (hh: number, mm = 0) => hh * 60 + mm;

export const STAFF = [
  {
    key: "sam",
    name: "Sam Rivera",
    title: "Massage therapist",
    bio: "Sports and deep-tissue work; late shift on Wednesdays.",
    color: "#0d9488",
    services: ["swedish-massage", "deep-tissue-massage", "assisted-stretch"],
    // weekday -> windows (0 = Sunday)
    hours: { 1: [[h(9), h(17)]], 2: [[h(9), h(17)]], 3: [[h(12), h(20)]], 4: [[h(9), h(17)]], 5: [[h(9), h(15)]] },
  },
  {
    key: "priya",
    name: "Priya Nair",
    title: "Esthetician",
    bio: "Facials and relaxation massage; works Saturdays.",
    color: "#db2777",
    services: ["signature-facial", "swedish-massage"],
    hours: { 2: [[h(10), h(18)]], 3: [[h(10), h(18)]], 4: [[h(10), h(18)]], 5: [[h(10), h(18)]], 6: [[h(9), h(14)]] },
  },
  {
    key: "alex",
    name: "Alex Chen",
    title: "Acupuncturist",
    bio: "Acupuncture and assisted stretching; split shift with a lunch break.",
    color: "#7c3aed",
    services: ["acupuncture", "assisted-stretch"],
    hours: { 1: [[h(8), h(12)], [h(13), h(17)]], 3: [[h(8), h(12)], [h(13), h(17)]], 4: [[h(8), h(12)], [h(13), h(17)]], 6: [[h(9), h(13)]] },
  },
] as const;

export type StaffKey = (typeof STAFF)[number]["key"];

/** Business, services, staff, staff↔service links and weekly hours. */
export async function seedCatalog(db: DB, opts: { staffUserIds?: Partial<Record<StaffKey, string>> } = {}) {
  await db.insert(schema.business).values({ id: 1, ...BUSINESS });
  const services = await db
    .insert(schema.services)
    .values(SERVICES.map((s) => ({ ...s })))
    .returning();
  const staff: Record<string, typeof schema.staff.$inferSelect> = {};
  for (const s of STAFF) {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: s.name, title: s.title, bio: s.bio, color: s.color, userId: opts.staffUserIds?.[s.key] ?? null })
      .returning();
    staff[s.key] = row!;
    await db.insert(schema.staffServices).values(s.services.map((slug) => ({ staffId: row!.id, serviceId: services.find((x) => x.slug === slug)!.id })));
    const rules = Object.entries(s.hours).flatMap(([wd, windows]) =>
      (windows as readonly (readonly [number, number])[]).map(([startMin, endMin]) => ({ staffId: row!.id, weekday: Number(wd), startMin, endMin })),
    );
    await db.insert(schema.availabilityRules).values(rules);
  }
  return { services, staff: staff as Record<StaffKey, typeof schema.staff.$inferSelect> };
}

/** Small deterministic PRNG so the seed produces the same calendar shape every run. */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REF = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Seed bookings from 7 days ago to `daysAhead` days ahead, placed with the real slot engine so they
 * never overlap (the exclusion constraint would reject them otherwise).
 */
export async function seedBookings(
  db: DB,
  opts: {
    now: Date;
    customerIds: string[];
    services: (typeof schema.services.$inferSelect)[];
    staff: Record<StaffKey, typeof schema.staff.$inferSelect>;
    perDay?: number;
    daysAhead?: number;
    seed?: number;
  },
) {
  const rand = prng(opts.seed ?? 42);
  const tz = BUSINESS.timezone;
  const today = dateInTz(opts.now, tz);
  const busy = new Map<string, Interval[]>();
  const rows: (typeof schema.bookings.$inferInsert)[] = [];
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!;
  const ref = () => `BK-${Array.from({ length: 6 }, () => REF[Math.floor(rand() * REF.length)]).join("")}`;

  for (let offset = -7; offset <= (opts.daysAhead ?? 10); offset++) {
    const date = addDays(today, offset);
    const wd = weekdayOf(date);
    const target = Math.floor((opts.perDay ?? 3) * (0.5 + rand()));
    for (let i = 0; i < target; i++) {
      const s = pick(STAFF);
      const windows = (s.hours as Record<number, readonly (readonly [number, number])[]>)[wd];
      if (!windows) continue;
      const slug = pick(s.services);
      const service = opts.services.find((x) => x.slug === slug)!;
      const staffRow = opts.staff[s.key];
      const slots = computeSlots({
        date,
        timezone: tz,
        windows: windows.map(([startMin, endMin]) => ({ startMin, endMin })),
        durationMin: service.durationMin,
        bufferMin: service.bufferMin,
        intervalMin: 30,
        busy: busy.get(staffRow.id) ?? [],
        // Past days are history; future days must respect notice like real bookings.
        now: offset < 0 ? new Date(0) : opts.now,
        minNoticeMin: offset < 0 ? 0 : BUSINESS.minNoticeMin,
      });
      if (slots.length === 0) continue;
      const startsAt = pick(slots);
      const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000);
      const blockedUntil = new Date(endsAt.getTime() + service.bufferMin * 60_000);
      const isPast = endsAt.getTime() < opts.now.getTime();
      const roll = rand();
      const status = isPast ? (roll < 0.08 ? "no_show" : roll < 0.16 ? "cancelled" : "completed") : roll < 0.06 ? "cancelled" : "confirmed";
      if (status !== "cancelled") busy.set(staffRow.id, [...(busy.get(staffRow.id) ?? []), { start: startsAt.getTime(), end: blockedUntil.getTime() }]);
      rows.push({
        reference: ref(),
        serviceId: service.id,
        staffId: staffRow.id,
        customerId: pick(opts.customerIds),
        startsAt,
        endsAt,
        blockedUntil,
        status,
        priceCents: service.priceCents,
        notes: "",
        createdAt: new Date(Math.min(opts.now.getTime(), startsAt.getTime()) - Math.floor(rand() * 10 + 1) * 86_400_000),
      });
    }
  }
  return rows.length ? db.insert(schema.bookings).values(rows).returning() : [];
}
