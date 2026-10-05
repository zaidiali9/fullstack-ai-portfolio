import { CalendarClock, ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { buttonVariants } from "@portfolio/ui/button";
import { BookingSummary } from "@/components/booking/booking-summary";
import { ActionButton } from "@/components/confirm-action-button";
import { TimeAgo } from "@/components/time-ago";
import { cancelAction, outcomeAction } from "@/server/actions/bookings";
import { requireTeamPage } from "@/server/access";
import { bookingHistory, bookingTiming, getBooking } from "@/server/bookings";
import { getBusiness } from "@/server/catalog";
import { dateInTz } from "@/server/scheduling/time";

export const metadata: Metadata = { title: "Booking" };

export default async function TeamBookingPage({ params, searchParams }: PageProps<"/dashboard/bookings/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireTeamPage();
  const booking = await getBooking(user, id).catch(() => null);
  if (!booking) notFound();
  const [b, history, { started }] = await Promise.all([getBusiness(), bookingHistory(id), bookingTiming(booking.startsAt)]);
  const date = dateInTz(booking.startsAt, b.timezone);
  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard?date=${date}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> Back to calendar
      </Link>
      {sp.rescheduled ? (
        <p className="mt-4 rounded-xl border bg-muted/50 p-4 text-sm" role="status">
          Booking moved. The customer has been notified.
        </p>
      ) : null}
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Booking {booking.reference}</h1>
      <BookingSummary className="mt-6" booking={booking} timezone={b.timezone} showCustomer />
      <p className="mt-2 text-sm text-muted-foreground">
        Customer: {booking.customerName} · {booking.customerEmail}
      </p>
      {booking.status === "confirmed" ? (
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {started ? (
            <>
              <ActionButton variant="outline" action={outcomeAction.bind(null, booking.id, booking.version, "no_show")} confirm="Mark this booking as a no-show?">
                Mark no-show
              </ActionButton>
              <ActionButton action={outcomeAction.bind(null, booking.id, booking.version, "completed")}>Mark completed</ActionButton>
            </>
          ) : (
            <>
              <ActionButton variant="outline" action={cancelAction.bind(null, booking.id, booking.version)} confirm="Cancel this booking? The customer will be notified.">
                Cancel booking
              </ActionButton>
              <Link href={`/dashboard/bookings/${booking.id}/reschedule`} className={buttonVariants()}>
                <CalendarClock className="size-4" aria-hidden /> Reschedule
              </Link>
            </>
          )}
        </div>
      ) : null}
      <section className="mt-10" aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-sm font-medium text-muted-foreground">
          History
        </h2>
        {history.length ? (
          <ol className="space-y-2 border-l pl-4 text-sm">
            {history.map((h) => (
              <li key={h.id}>
                <p>{h.summary}</p>
                <p className="text-xs text-muted-foreground">
                  <TimeAgo date={h.createdAt} />
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No recorded changes.</p>
        )}
      </section>
    </div>
  );
}
