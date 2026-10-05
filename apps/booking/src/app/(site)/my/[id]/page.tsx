import { CalendarClock, ChevronLeft, PartyPopper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { buttonVariants } from "@portfolio/ui/button";
import { BookingSummary } from "@/components/booking/booking-summary";
import { ActionButton } from "@/components/confirm-action-button";
import { cancelAction } from "@/server/actions/bookings";
import { requireCustomer } from "@/server/access";
import { bookingTiming, getBooking } from "@/server/bookings";
import { getBusiness } from "@/server/catalog";

export const metadata: Metadata = { title: "Booking", robots: { index: false } };

export default async function MyBookingPage({ params, searchParams }: PageProps<"/my/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireCustomer();
  const booking = await getBooking(user, id).catch(() => null);
  if (!booking || booking.customerId !== user.id || booking.status === "held") notFound();
  const [b, timing] = await Promise.all([getBusiness(), bookingTiming(booking.startsAt)]);
  const changeable = booking.status === "confirmed" && timing.customerCanChange;
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Link href="/my" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> My bookings
      </Link>
      {sp.booked ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4" role="status">
          <PartyPopper className="mt-0.5 size-5 text-primary" aria-hidden />
          <div>
            <p className="font-medium">You&apos;re booked!</p>
            <p className="text-sm text-muted-foreground">We&apos;ve let the team know. Your reference is {booking.reference}.</p>
          </div>
        </div>
      ) : null}
      {sp.rescheduled ? (
        <p className="mt-4 rounded-xl border bg-muted/50 p-4 text-sm" role="status">
          Your booking was moved. Same reference, new time.
        </p>
      ) : null}
      <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight">Your appointment</h1>
      <BookingSummary className="mt-6" booking={booking} timezone={b.timezone} />
      {booking.status === "confirmed" ? (
        changeable ? (
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <ActionButton variant="outline" action={cancelAction.bind(null, booking.id, booking.version)} confirm="Cancel this appointment?">
              Cancel booking
            </ActionButton>
            <Link href={`/my/${booking.id}/reschedule`} className={buttonVariants()}>
              <CalendarClock className="size-4" aria-hidden /> Reschedule
            </Link>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">Online changes close {b.minNoticeMin} minutes before the appointment. Please call the studio to make changes.</p>
        )
      ) : null}
    </div>
  );
}
