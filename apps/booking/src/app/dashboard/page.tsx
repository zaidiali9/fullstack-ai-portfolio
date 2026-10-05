import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { Input } from "@portfolio/ui/input";
import { DayCalendar } from "@/components/dashboard/day-calendar";
import { LiveRefresh } from "@/components/dashboard/live-refresh";
import { dayLabel, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { today } from "@/server/availability";
import { dayAgenda } from "@/server/bookings";
import { addDays, dateInTz, minutesInTz, weekdayOf } from "@/server/scheduling/time";
import { getBusiness } from "@/server/catalog";

export const metadata: Metadata = { title: "Calendar" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  const b = await getBusiness();
  const t = today(b.timezone);
  const raw = typeof sp.date === "string" ? sp.date : "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : t;
  const agenda = await dayAgenda(date);
  const minutes = Object.fromEntries(
    agenda.bookings.map((x) => {
      // Bookings that cross midnight are clipped to the day.
      const end = dateInTz(x.endsAt, b.timezone) === date ? minutesInTz(x.endsAt, b.timezone) : 1440;
      const blockedEnd = dateInTz(x.blockedUntil, b.timezone) === date ? minutesInTz(x.blockedUntil, b.timezone) : 1440;
      return [x.id, { start: minutesInTz(x.startsAt, b.timezone), end, blockedEnd }];
    }),
  );
  const active = agenda.bookings.filter((x) => x.status !== "held");
  const bookedHours = active.reduce((s, x) => s + (x.endsAt.getTime() - x.startsAt.getTime()) / 3_600_000, 0);
  const value = active.filter((x) => x.status !== "no_show").reduce((s, x) => s + x.priceCents, 0);
  const nav = (d: string) => `/dashboard?date=${d}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{dayLabel(date)}</h1>
            <LiveRefresh date={date} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {active.length} appointment{active.length === 1 ? "" : "s"} · {bookedHours.toFixed(1)} h booked · {money(value)} scheduled
            {date === t ? " · today" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={nav(addDays(date, -1))} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Previous day">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <Link href={nav(t)} className={cn(buttonVariants({ variant: date === t ? "secondary" : "outline" }))} aria-current={date === t ? "date" : undefined}>
            Today
          </Link>
          <Link href={nav(addDays(date, 1))} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Next day">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
          <form action="/dashboard" method="get" className="flex items-center gap-2">
            <label htmlFor="jump-date" className="sr-only">
              Go to date
            </label>
            <Input key={date} id="jump-date" type="date" name="date" defaultValue={date} className="h-9 w-40" />
            <button type="submit" className={buttonVariants({ variant: "outline" })}>
              Go
            </button>
          </form>
        </div>
      </div>
      <DayCalendar
        date={date}
        weekday={weekdayOf(date)}
        timezone={agenda.timezone}
        staff={agenda.staff}
        rules={agenda.rules}
        bookings={agenda.bookings}
        minutes={minutes}
        nowMin={date === t ? minutesInTz(new Date(), b.timezone) : null}
      />
      {agenda.bookings.length === 0 ? <p className="text-center text-sm text-muted-foreground">No appointments on this day yet.</p> : null}
      <p className="text-xs text-muted-foreground">
        Striped areas are outside working hours; grey tails show clean-up buffers. Dashed blocks are holds waiting for the customer to confirm. Times in {b.timezone}.
      </p>
    </div>
  );
}
