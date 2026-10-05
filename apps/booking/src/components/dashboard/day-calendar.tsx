import Link from "next/link";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, timeIn } from "@/lib/format";
import type { BookingView } from "@/server/bookings";

const PX_PER_MIN = 1.1;

interface Props {
  date: string;
  weekday: number;
  timezone: string;
  staff: { id: string; name: string; title: string; color: string }[];
  rules: { staffId: string; weekday: number; startMin: number; endMin: number }[];
  bookings: BookingView[];
  /** Minutes from local midnight for each booking start/end (computed on the server in the studio tz). */
  minutes: Record<string, { start: number; end: number; blockedEnd: number }>;
  nowMin: number | null;
}

const hourLabel = (m: number) => {
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
};

/** Staff-column day view. Scrolls horizontally on narrow screens; every booking is a labelled link. */
export function DayCalendar({ weekday, timezone, staff, rules, bookings, minutes, nowMin }: Props) {
  const today = rules.filter((r) => r.weekday === weekday);
  const bookedMins = Object.values(minutes);
  const open = Math.min(8 * 60, ...today.map((r) => r.startMin), ...bookedMins.map((m) => m.start));
  const close = Math.max(18 * 60, ...today.map((r) => r.endMin), ...bookedMins.map((m) => m.blockedEnd));
  const start = Math.floor(open / 60) * 60;
  const end = Math.ceil(close / 60) * 60;
  const height = (end - start) * PX_PER_MIN;
  const hours = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60);
  const y = (m: number) => (m - start) * PX_PER_MIN;

  return (
    <div className="overflow-x-auto overflow-y-hidden rounded-xl border bg-card">
      <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `3.5rem repeat(${staff.length}, minmax(10rem, 1fr))` }}>
        <div className="sticky left-0 z-10 border-b bg-card" />
        {staff.map((p) => (
          <div key={p.id} className="flex items-center gap-2 border-b border-l px-3 py-2.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">{today.some((r) => r.staffId === p.id) ? p.title : "Not working"}</p>
            </div>
          </div>
        ))}

        <div className="sticky left-0 z-10 bg-card" style={{ height }} aria-hidden>
          {hours.map((h) => (
            <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums" style={{ top: y(h) }}>
              {h < end ? hourLabel(h) : ""}
            </span>
          ))}
        </div>
        {staff.map((p) => {
          const windows = today.filter((r) => r.staffId === p.id);
          const mine = bookings.filter((b) => b.staffId === p.id);
          return (
            <div key={p.id} className="relative border-l bg-[repeating-linear-gradient(-45deg,transparent_0_6px,var(--muted)_6px_8px)]" style={{ height }}>
              {windows.map((w) => (
                <div key={w.startMin} className="absolute inset-x-0 bg-card" style={{ top: y(w.startMin), height: (w.endMin - w.startMin) * PX_PER_MIN }} aria-hidden />
              ))}
              {hours.map((h) => (
                <div key={h} className="absolute inset-x-0 border-t border-dashed border-border/70" style={{ top: y(h) }} aria-hidden />
              ))}
              {nowMin !== null && nowMin >= start && nowMin <= end ? (
                <div className="absolute inset-x-0 z-20 border-t-2 border-brand-clay" style={{ top: y(nowMin) }} aria-hidden />
              ) : null}
              <ul>
                {mine.map((b) => {
                  const m = minutes[b.id]!;
                  const h = Math.max((m.end - m.start) * PX_PER_MIN, 28);
                  const compact = h < 48;
                  return (
                    <li key={b.id} className="absolute inset-x-1 z-10" style={{ top: y(m.start) + 1, height: h - 2 }}>
                      {m.blockedEnd > m.end ? (
                        <div className="absolute inset-x-2 rounded-b bg-muted-foreground/15" style={{ top: h - 2, height: (m.blockedEnd - m.end) * PX_PER_MIN }} title="Clean-up buffer" aria-hidden />
                      ) : null}
                      <Link
                        href={`/dashboard/bookings/${b.id}`}
                        aria-label={`${timeIn(b.startsAt, timezone)} ${b.serviceName} with ${b.staffName} for ${b.customerName}, ${STATUS_LABEL[b.status]}`}
                        className={cn(
                          "flex h-full overflow-hidden rounded-md border-l-4 px-2 text-xs shadow-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          compact ? "items-center gap-1.5 py-0.5" : "flex-col py-1",
                          b.status === "held" ? "border border-dashed bg-background" : "bg-secondary hover:bg-accent",
                          (b.status === "completed" || b.status === "no_show") && "opacity-70",
                        )}
                        style={{ borderLeftColor: b.staffColor }}
                      >
                        <span className="shrink-0 font-medium tabular-nums">
                          {timeIn(b.startsAt, timezone)} · {b.status === "held" ? "Held" : b.customerName}
                        </span>
                        <span className="min-w-0 truncate text-muted-foreground">{b.serviceName}</span>
                        {b.status === "no_show" ? <span className="text-destructive">No-show</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
