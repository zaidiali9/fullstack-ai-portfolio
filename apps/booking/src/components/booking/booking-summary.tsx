import { CalendarDays, Clock, Hash, UserRound } from "lucide-react";
import { Badge } from "@portfolio/ui/badge";
import { cn } from "@/lib/utils";
import { dateIn, durationLabel, money, STATUS_LABEL, timeIn } from "@/lib/format";

export interface SummaryBooking {
  reference: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  serviceName: string;
  durationMin: number;
  staffName: string;
  staffColor: string;
  priceCents: number;
  notes?: string;
  customerName?: string;
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={status === "confirmed" ? "default" : status === "cancelled" || status === "no_show" ? "destructive" : "secondary"}
      className={cn(status === "completed" && "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300")}
    >
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function BookingSummary({ booking: b, timezone, className, showCustomer = false }: { booking: SummaryBooking; timezone: string; className?: string; showCustomer?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-card p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{b.serviceName}</h2>
          {showCustomer && b.customerName ? <p className="text-sm text-muted-foreground">for {b.customerName}</p> : null}
        </div>
        <StatusBadge status={b.status} />
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Date</dt>
          <dd>{dateIn(b.startsAt, timezone)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Time</dt>
          <dd>
            {timeIn(b.startsAt, timezone)} – {timeIn(b.endsAt, timezone)} ({durationLabel(b.durationMin)})
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <UserRound className="size-4 text-muted-foreground" aria-hidden />
          <dt className="sr-only">With</dt>
          <dd className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: b.staffColor }} aria-hidden />
            {b.staffName}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <Hash className="size-4 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Reference</dt>
          <dd className="font-mono">{b.reference}</dd>
        </div>
      </dl>
      <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
        <span className="text-muted-foreground">Pay at the studio</span>
        <span className="font-semibold tabular-nums">{money(b.priceCents)}</span>
      </div>
      {b.notes ? <p className="mt-3 rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{b.notes}</p> : null}
    </div>
  );
}
