import { z } from "zod";
import { clientIp, enforceRateLimit, route } from "@portfolio/kit";
import { db } from "@/db";
import { daySlots, daysWithOpenings, today } from "@/server/availability";
import { getBusiness, getServiceById } from "@/server/catalog";
import { addDays } from "@/server/scheduling/time";

const query = z.object({
  service: z.uuid(),
  staff: z.union([z.uuid(), z.literal("any")]).default("any"),
  date: z.iso.date().optional(),
});

/** Public: open days for the booking horizon plus the slots on one date. No customer data. */
export const GET = route(async (req: Request) => {
  await enforceRateLimit(db, `avail:${clientIp(req.headers)}`, { limit: 120, windowMs: 60_000, message: "Too many requests. Please slow down." });
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const [b, service] = await Promise.all([getBusiness(), getServiceById(q.service)]);
  const staffId = q.staff === "any" ? null : q.staff;
  const t = today(b.timezone);
  const counts = await daysWithOpenings({ service, staffId, fromDate: t, days: b.bookingHorizonDays + 1 });
  const days = Array.from({ length: b.bookingHorizonDays + 1 }, (_, i) => addDays(t, i)).map((date) => ({ date, open: counts.get(date) ?? 0 }));
  const date = q.date && q.date >= t && q.date <= addDays(t, b.bookingHorizonDays) ? q.date : (days.find((d) => d.open > 0)?.date ?? t);
  const slots = await daySlots({ service, staffId, date });
  return Response.json({ date, days, slots, timezone: b.timezone }, { headers: { "Cache-Control": "no-store" } });
});
