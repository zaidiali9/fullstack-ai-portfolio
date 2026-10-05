"use client";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { toast } from "sonner";
import { LiveBadge, useLiveEvents } from "@/components/booking/use-live-events";

interface TeamEvent {
  action: string;
  reference: string;
  bookingId: string;
  staffId: string;
  dates: string[];
}

const ANNOUNCE: Record<string, string> = { confirmed: "New booking", cancelled: "Cancelled", rescheduled: "Moved" };

/** Re-renders the server calendar when a booking on the shown date changes (and announces it). */
export function LiveRefresh({ date }: { date: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const status = useLiveEvents<TeamEvent>("/api/stream/team", (ev) => {
    if (ANNOUNCE[ev.action]) toast.info(`${ANNOUNCE[ev.action]}: ${ev.reference}`, { description: ev.dates.includes(date) ? "On this day — calendar updated." : undefined });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 200);
  });
  return <LiveBadge status={status} />;
}
