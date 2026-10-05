import { CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { EmptyState } from "@portfolio/ui/empty-state";
import { PageHeader } from "@portfolio/ui/page-header";
import { StatusBadge } from "@/components/booking/booking-summary";
import { dateIn, timeIn } from "@/lib/format";
import { requireCustomer } from "@/server/access";
import { listMyBookings, type BookingView } from "@/server/bookings";
import { getBusiness } from "@/server/catalog";

export const metadata: Metadata = { title: "My bookings", robots: { index: false } };

function Row({ b, tz }: { b: BookingView; tz: string }) {
  return (
    <li>
      <Link href={`/my/${b.id}`} className="flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-muted py-1.5 text-center">
          <span className="text-xs text-muted-foreground">{dateIn(b.startsAt, tz, { month: "short" })}</span>
          <span className="text-xl leading-tight font-semibold">{dateIn(b.startsAt, tz, { day: "numeric" })}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{b.serviceName}</p>
          <p className="text-sm text-muted-foreground">
            {dateIn(b.startsAt, tz, { weekday: "short" })} {timeIn(b.startsAt, tz)} · with {b.staffName}
          </p>
        </div>
        <StatusBadge status={b.status} />
      </Link>
    </li>
  );
}

export default async function MyBookingsPage() {
  const user = await requireCustomer();
  const [{ upcoming, past }, b] = await Promise.all([listMyBookings(user), getBusiness()]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader
        title="My bookings"
        description={`Signed in as ${user.email}`}
        actions={
          <Link href="/#services" className={buttonVariants()}>
            <CalendarPlus className="size-4" aria-hidden /> New booking
          </Link>
        }
      />
      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="mb-3 text-sm font-medium text-muted-foreground">
          Upcoming
        </h2>
        {upcoming.length ? (
          <ul className="space-y-3">
            {upcoming.map((x) => (
              <Row key={x.id} b={x} tz={b.timezone} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={CalendarPlus}
            title="No upcoming appointments"
            description="When you book, it shows up here — you can reschedule or cancel up to an hour before."
            action={
              <Link href="/#services" className={buttonVariants()}>
                Browse services
              </Link>
            }
          />
        )}
      </section>
      {past.length ? (
        <section aria-labelledby="past-heading" className="mt-10">
          <h2 id="past-heading" className="mb-3 text-sm font-medium text-muted-foreground">
            Past and cancelled
          </h2>
          <ul className="space-y-3">
            {past.map((x) => (
              <Row key={x.id} b={x} tz={b.timezone} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
