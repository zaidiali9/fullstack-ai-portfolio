import "server-only";
import { and, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { aiUnavailable } from "@portfolio/ai";
import { enforceRateLimit } from "@portfolio/kit";
import { db, schema } from "@/db";
import { getAI } from "@/lib/ai";
import { env } from "@/lib/env";
import type { AppUser } from "../access";
import { findOpenings, pickOpenings, today } from "../availability";
import { getBusiness, listServices, listStaff } from "../catalog";
import { addDays, dateInTz, dayBounds, formatDateLong, weekdayOf, WEEKDAYS } from "../scheduling/time";
import { buildDigestMessages, unverifiedNumbers, type DigestStats } from "./digest-core";
import { buildNlMessages, mergeTimePrefs, nlRequestSchema, normalizeNl, resolveDates, resolveNl, timeWindow } from "./nl-core";

async function enforceAiRate(userKey: string) {
  await enforceRateLimit(db, `ai:${userKey}`, {
    limit: env().AI_USER_PER_MINUTE,
    windowMs: 60_000,
    message: "You're using the assistant too quickly. Please wait a minute.",
  });
}

/* ------------------------------------------------------- natural-language search */

export const nlInput = z.object({
  request: z.string().trim().min(3, "Tell us what you'd like to book.").max(300, "Please keep it under 300 characters."),
});

export interface NlResult {
  interpretation: {
    service: { id: string; slug: string; name: string } | null;
    staff: { id: string; name: string } | null;
    dates: { from: string; to: string; label: string; explicit: boolean };
    time: string | null;
  };
  options: { start: string; staffId: string; staffName: string }[];
  notes: string[];
  model: { provider: string; model: string };
}

const fmtMin = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm ? `${h12}:${String(mm).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
};

/**
 * "Deep tissue with Sam next Tuesday after 4" -> real open slots.
 * The model only extracts filters (validated with zod, then matched against the catalog);
 * dates are resolved deterministically; slots come from the same availability engine as the
 * booking page. The model never sees the calendar and cannot book.
 */
export async function searchFromRequest(rateKey: string, raw: unknown, userId?: string): Promise<NlResult> {
  const { request } = nlInput.parse(raw);
  await enforceAiRate(rateKey);
  const ai = getAI();
  if (!ai.status().chat.available) throw aiUnavailable();
  const [b, services, staff] = await Promise.all([getBusiness(), listServices(), listStaff()]);

  const result = await ai.generateObject({
    feature: "nl_search",
    userId,
    schema: nlRequestSchema,
    prepare: normalizeNl,
    messages: buildNlMessages({ services, staff }, request),
    maxOutputTokens: 120,
    temperature: 0,
  });
  const parsed = result.object;
  const { service, staffMember, notes } = resolveNl(parsed, services, staff, request);

  const now = new Date();
  const t = today(b.timezone, now);
  const resolved = resolveDates(request, t);
  const dates = resolved ? { ...resolved, explicit: true } : { from: t, to: addDays(t, 6), label: "the next 7 days", explicit: false };
  // Explicit clock times and day-parts are parsed by code; the model fills in fuzzy phrasing.
  const window = timeWindow(mergeTimePrefs(parsed, request));
  const interpretation: NlResult["interpretation"] = {
    service: service ? { id: service.id, slug: service.slug, name: service.name } : null,
    staff: staffMember ? { id: staffMember.id, name: staffMember.name } : null,
    dates,
    time: window ? `${fmtMin(window.fromMin)}–${window.toMin >= 1440 ? "close" : fmtMin(window.toMin)}` : null,
  };
  const model = { provider: result.provider, model: result.model };
  if (!service) {
    notes.push("We couldn't tell which service you want — pick one below and we'll keep the rest of your request.");
    return { interpretation, options: [], notes, model };
  }

  if (dates.to < t) notes.push("That date has already passed, so we looked at the next 7 days instead.");
  const from = dates.to < t ? t : dates.from;
  const to = dates.to < t ? addDays(t, 6) : dates.to;
  const name = (id: string) => staff.find((s) => s.id === id)?.name ?? "";
  let picked = await pickOpenings(await findOpenings({ service, staffId: staffMember?.id, fromDate: from, toDate: to, now }), { window, perDay: 3, limit: 6 });
  if (picked.length === 0) {
    // Nothing matched: look at the following two weeks with the same time preference.
    const later = await findOpenings({ service, staffId: staffMember?.id, fromDate: addDays(to, 1), toDate: addDays(to, 14), now });
    picked = await pickOpenings(later, { window, perDay: 2, limit: 6 });
    notes.push(picked.length ? `Nothing open for ${dates.label}${interpretation.time ? ` (${interpretation.time})` : ""} — here are the next available times.` : "We couldn't find any open times in the next few weeks for that request.");
  }
  return { interpretation, options: picked.map((o) => ({ start: o.start.toISOString(), staffId: o.staffId, staffName: name(o.staffId) })), notes, model };
}

/* ------------------------------------------------------------------ weekly digest */

/** Deterministic stats for the digest (the model only narrates these). */
export async function digestStats(now = new Date()): Promise<DigestStats> {
  const b = await getBusiness();
  const t = today(b.timezone, now);
  const pastFrom = addDays(t, -7);
  const [services, staff, rules] = await Promise.all([listServices(), listStaff(), db.select().from(schema.availabilityRules)]);

  const rowsIn = (from: string, toExclusive: string) =>
    db
      .select({ status: schema.bookings.status, startsAt: schema.bookings.startsAt, endsAt: schema.bookings.endsAt, serviceId: schema.bookings.serviceId, staffId: schema.bookings.staffId, priceCents: schema.bookings.priceCents })
      .from(schema.bookings)
      .where(
        and(
          gte(schema.bookings.startsAt, dayBounds(from, b.timezone).start),
          lt(schema.bookings.startsAt, dayBounds(toExclusive, b.timezone).start),
          inArray(schema.bookings.status, ["confirmed", "completed", "no_show", "cancelled"]),
        ),
      );
  const [past, next] = await Promise.all([rowsIn(pastFrom, t), rowsIn(t, addDays(t, 7))]);

  const held = past.filter((r) => r.status !== "cancelled");
  const countBy = <T,>(items: T[], key: (x: T) => string) => {
    const m = new Map<string, number>();
    for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
    return [...m.entries()].sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0]));
  };
  const top = countBy(held, (r) => r.serviceId)[0];
  const busiest = countBy(held, (r) => WEEKDAYS[weekdayOf(dateInTz(r.startsAt, b.timezone))]!)[0];

  const upcoming = next.filter((r) => r.status === "confirmed");
  const byStaff = staff.map((s) => {
    const mine = upcoming.filter((r) => r.staffId === s.id);
    let availableMin = 0;
    for (let d = t; d < addDays(t, 7); d = addDays(d, 1)) {
      for (const r of rules) if (r.staffId === s.id && r.weekday === weekdayOf(d)) availableMin += r.endMin - r.startMin;
    }
    const bookedMin = mine.reduce((sum, r) => sum + (r.endsAt.getTime() - r.startsAt.getTime()) / 60_000, 0);
    return { name: s.name, appointments: mine.length, utilizationPct: availableMin ? Math.round((bookedMin / availableMin) * 100) : 0 };
  });
  const openDays = Array.from({ length: 7 }, (_, i) => addDays(t, i)).filter((d) => rules.some((r) => r.weekday === weekdayOf(d)));
  const perDay = openDays.map((d) => ({ day: formatDateLong(d), appointments: upcoming.filter((r) => dateInTz(r.startsAt, b.timezone) === d).length }));
  const quietest = [...perDay].sort((a, c) => a.appointments - c.appointments)[0] ?? null;

  return {
    period: { from: pastFrom, to: addDays(t, 6) },
    past7: {
      appointments: held.length,
      completed: past.filter((r) => r.status === "completed").length,
      noShows: past.filter((r) => r.status === "no_show").length,
      cancellations: past.filter((r) => r.status === "cancelled").length,
      bookedValueUsd: Math.round(held.filter((r) => r.status !== "no_show").reduce((s, r) => s + r.priceCents, 0) / 100),
      topService: top ? { name: services.find((s) => s.id === top[0])?.name ?? "Unknown", count: top[1] } : null,
      busiestDay: busiest ? { day: busiest[0], count: busiest[1] } : null,
    },
    next7: { appointments: upcoming.length, byStaff, quietestDay: quietest },
  };
}

/** Owner-only streamed narrative over `digestStats`; the trailer lists numbers not found in the stats. */
export async function streamDigest(user: AppUser) {
  await enforceAiRate(user.id);
  const ai = getAI();
  if (!ai.status().chat.available) throw aiUnavailable();
  const [b, stats] = await Promise.all([getBusiness(), digestStats()]);
  const gen = ai.streamText({ feature: "weekly_digest", userId: user.id, messages: buildDigestMessages(b.name, stats), maxOutputTokens: 260, temperature: 0.2 });
  async function* withCheck(): AsyncGenerator<string, unknown> {
    let text = "";
    let r = await gen.next();
    while (!r.done) {
      text += r.value;
      yield r.value;
      r = await gen.next();
    }
    return { unverified: unverifiedNumbers(text, stats), provider: r.value.provider, model: r.value.model };
  }
  return { stream: withCheck(), stats };
}

