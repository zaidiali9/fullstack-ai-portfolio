import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SlotPicker } from "@/components/booking/slot-picker";
import { dateIn, timeIn } from "@/lib/format";
import { requireCustomer } from "@/server/access";
import { getBooking } from "@/server/bookings";
import { getBusiness, getServiceById, listStaff } from "@/server/catalog";
import { dateInTz } from "@/server/scheduling/time";

export const metadata: Metadata = { title: "Reschedule", robots: { index: false } };

export default async function ReschedulePage({ params }: PageProps<"/my/[id]/reschedule">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireCustomer();
  const booking = await getBooking(user, id).catch(() => null);
  if (!booking || booking.customerId !== user.id || booking.status !== "confirmed") notFound();
  const [b, service, staff] = await Promise.all([getBusiness(), getServiceById(booking.serviceId), listStaff()]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href={`/my/${booking.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> Back to booking
      </Link>
      <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight">Reschedule {service.name}</h1>
      <p className="mt-1 mb-8 text-muted-foreground">
        Currently {dateIn(booking.startsAt, b.timezone)} at {timeIn(booking.startsAt, b.timezone)} with {booking.staffName}. Pick a new time below.
      </p>
      <SlotPicker
        service={{ id: service.id, slug: service.slug, name: service.name }}
        staff={staff.filter((p) => service.staffIds.includes(p.id)).map((p) => ({ id: p.id, name: p.name, title: p.title, color: p.color }))}
        timezone={b.timezone}
        initial={{ staffId: booking.staffId, date: dateInTz(booking.startsAt, b.timezone) }}
        signedIn
        mode={{ kind: "reschedule", bookingId: booking.id, version: booking.version, returnTo: `/my/${booking.id}` }}
      />
    </div>
  );
}
