import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { BookingSummary } from "@/components/booking/booking-summary";
import { ConfirmForm } from "@/components/booking/confirm-form";
import { requireCustomer } from "@/server/access";
import { getBooking } from "@/server/bookings";
import { getBusiness } from "@/server/catalog";
import { dateInTz } from "@/server/scheduling/time";

export const metadata: Metadata = { title: "Confirm your booking", robots: { index: false } };

export default async function ConfirmPage({ params }: PageProps<"/book/confirm/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireCustomer();
  const booking = await getBooking(user, id).catch(() => null);
  if (!booking || booking.customerId !== user.id) notFound();
  if (booking.status === "confirmed") redirect(`/my/${booking.id}`);
  const b = await getBusiness();
  const backHref = `/book/${booking.serviceSlug}?staff=${booking.staffId}&date=${dateInTz(booking.startsAt, b.timezone)}`;
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Confirm your booking</h1>
      <p className="mt-1 text-muted-foreground">Check the details, add a note if you like, and confirm.</p>
      <BookingSummary className="mt-6" booking={booking} timezone={b.timezone} />
      <div className="mt-6">
        {booking.status === "held" && booking.holdExpiresAt ? (
          <ConfirmForm bookingId={booking.id} expiresAt={booking.holdExpiresAt.toISOString()} backHref={backHref} />
        ) : (
          <p className="rounded-md bg-muted p-4 text-sm">This booking can no longer be confirmed. Please pick a new time.</p>
        )}
      </div>
    </div>
  );
}
