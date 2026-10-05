"use client";
import { CalendarX2, Clock, RefreshCw, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@portfolio/ui/alert";
import { Button } from "@portfolio/ui/button";
import { Skeleton } from "@portfolio/ui/skeleton";
import { Spinner } from "@portfolio/ui/spinner";
import { cn } from "@/lib/utils";
import { dateIn, dayLabel, hourIn, timeIn } from "@/lib/format";
import { holdAction, rescheduleAction, type SlotResult } from "@/server/actions/bookings";
import { LiveBadge, useLiveEvents } from "./use-live-events";

interface StaffOption {
  id: string;
  name: string;
  title: string;
  color: string;
}

interface Availability {
  key: string;
  date: string;
  days: { date: string; open: number }[];
  slots: { start: string; staffIds: string[] }[];
}

type Mode = { kind: "book" } | { kind: "reschedule"; bookingId: string; version: number; returnTo: string };

export interface SlotPickerProps {
  service: { id: string; slug: string; name: string };
  staff: StaffOption[];
  timezone: string;
  initial: { staffId?: string; date?: string; time?: string };
  signedIn: boolean;
  mode: Mode;
}

const PERIODS = [
  { label: "Morning", test: (h: number) => h < 12 },
  { label: "Afternoon", test: (h: number) => h >= 12 && h < 17 },
  { label: "Evening", test: (h: number) => h >= 17 },
];

export function SlotPicker({ service, staff, timezone, initial, signedIn, mode }: SlotPickerProps) {
  const router = useRouter();
  const [staffId, setStaffId] = useState(initial.staffId && staff.some((s) => s.id === initial.staffId) ? initial.staffId : "any");
  const [date, setDate] = useState<string | undefined>(initial.date);
  const [data, setData] = useState<Availability | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [highlight, setHighlight] = useState<string | undefined>(initial.time);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ message: string; alternatives: NonNullable<Extract<SlotResult, { ok: false }>["alternatives"]> } | null>(null);
  const [, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const key = `${staffId}|${date ?? ""}|${refreshTick}`;
  const loading = !data || data.key !== key;
  const highlightRef = useRef(highlight);
  useEffect(() => {
    highlightRef.current = highlight;
  }, [highlight]);

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams({ service: service.id, staff: staffId, ...(date ? { date } : {}), ...(mode.kind === "reschedule" ? { exclude: mode.bookingId } : {}) });
    fetch(`/api/availability?${params}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "Couldn't load availability.");
        return res.json() as Promise<Omit<Availability, "key">>;
      })
      .then((json) => {
        setFailed(null);
        setData((prev) => {
          // If the time the customer was looking at just disappeared, say so.
          if (prev && highlightRef.current && prev.date === json.date && prev.slots.some((s) => s.start === highlightRef.current) && !json.slots.some((s) => s.start === highlightRef.current)) {
            toast.warning("The suggested time was just booked by someone else.");
          }
          return { ...json, key };
        });
        if (!date) setDate(json.date);
      })
      .catch((err: unknown) => {
        if ((err as Error).name !== "AbortError") setFailed((err as Error).message);
      });
    return () => ctrl.abort();
  }, [service.id, staffId, date, key, mode]);

  const live = useLiveEvents<{ dates: string[]; staffId: string }>("/api/stream", (ev) => {
    if (staffId !== "any" && ev.staffId !== staffId) return;
    if (!staff.some((s) => s.id === ev.staffId)) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setRefreshTick((t) => t + 1), 250);
  });

  const staffName = useCallback((id: string) => staff.find((s) => s.id === id)?.name.split(" ")[0] ?? "", [staff]);
  const effectiveDate = date ?? data?.date;
  const slots = useMemo(() => data?.slots ?? [], [data]);

  const signInUrl = (start?: string) => {
    const q = new URLSearchParams({ staff: staffId, ...(effectiveDate ? { date: effectiveDate } : {}), ...(start ? { time: start } : {}) });
    return `/sign-in?next=${encodeURIComponent(`/book/${service.slug}?${q}`)}`;
  };

  const pick = (start: string) => {
    if (!signedIn) {
      router.push(signInUrl(start));
      return;
    }
    setPendingStart(start);
    setConflict(null);
    startTransition(async () => {
      const res =
        mode.kind === "book"
          ? await holdAction({ serviceId: service.id, staffId, start })
          : await rescheduleAction({ bookingId: mode.bookingId, version: mode.version, staffId, start });
      if (res.ok) {
        if (mode.kind === "book") router.push(`/book/confirm/${res.bookingId}`);
        else {
          toast.success("Booking moved.");
          router.push(`${mode.returnTo}?rescheduled=1`);
        }
        return;
      }
      setPendingStart(null);
      if (res.signIn) {
        router.push(signInUrl(start));
        return;
      }
      setConflict({ message: res.message, alternatives: res.alternatives ?? [] });
      toast.error(res.message);
      setRefreshTick((t) => t + 1);
    });
  };

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">With</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Staff member">
          {[{ id: "any", name: "Anyone available", title: "", color: "" }, ...staff].map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={staffId === s.id}
              onClick={() => {
                setStaffId(s.id);
                setConflict(null);
              }}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                staffId === s.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {s.color ? <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden /> : <UserRound className="size-4" aria-hidden />}
              {s.name}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Date</h2>
          <LiveBadge status={live} />
        </div>
        {data ? (
          <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" role="listbox" aria-label="Choose a date">
            <div className="flex w-max gap-2">
              {data.days.map((d) => {
                const selected = d.date === effectiveDate;
                return (
                  <button
                    key={d.date}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={d.open === 0}
                    aria-label={`${dayLabel(d.date)}, ${d.open ? `${d.open} open time${d.open === 1 ? "" : "s"}` : "no open times"}`}
                    onClick={() => {
                      setDate(d.date);
                      setConflict(null);
                    }}
                    className={cn(
                      "flex w-16 flex-col items-center rounded-lg border px-1 py-2 text-center transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45",
                      selected ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                    )}
                  >
                    <span className="text-xs">{dayLabel(d.date, { weekday: "short" })}</span>
                    <span className="text-lg font-semibold leading-tight">{dayLabel(d.date, { day: "numeric" })}</span>
                    <span className={cn("text-[11px]", selected ? "opacity-90" : "text-muted-foreground")}>{d.open ? `${d.open} open` : "None"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex gap-2" aria-hidden>
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-[74px] w-16 rounded-lg" />
            ))}
          </div>
        )}
      </div>

      {conflict ? (
        <Alert variant="destructive" aria-live="assertive">
          <CalendarX2 aria-hidden />
          <AlertTitle>{conflict.message}</AlertTitle>
          <AlertDescription>
            {conflict.alternatives.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {conflict.alternatives.map((a) => (
                  <Button key={a.start + a.staffId} size="sm" variant="outline" onClick={() => pick(a.start)} disabled={!!pendingStart}>
                    {dateIn(a.start, timezone, { weekday: "short", month: "short", day: "numeric" })} · {timeIn(a.start, timezone)} with {a.staffName.split(" ")[0]}
                  </Button>
                ))}
              </div>
            ) : (
              <p>Please choose another time below.</p>
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="times-heading" aria-busy={loading}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="times-heading" className="text-sm font-medium">
            {effectiveDate ? `Times on ${dayLabel(effectiveDate)}` : "Times"}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setRefreshTick((t) => t + 1)} aria-label="Refresh times">
            <RefreshCw className="size-4" aria-hidden />
          </Button>
        </div>
        {failed ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t load times</AlertTitle>
            <AlertDescription>
              {failed}{" "}
              <button type="button" className="underline" onClick={() => setRefreshTick((t) => t + 1)}>
                Try again
              </button>
            </AlertDescription>
          </Alert>
        ) : !data ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-11 rounded-md" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No open times on this day. Pick another date above.</p>
        ) : (
          <div className="space-y-4">
            {PERIODS.map((p) => {
              const inPeriod = slots.filter((s) => p.test(hourIn(s.start, timezone)));
              if (!inPeriod.length) return null;
              return (
                <div key={p.label}>
                  <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{p.label}</h3>
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {inPeriod.map((s) => {
                      const isPending = pendingStart === s.start;
                      const suggested = highlight === s.start;
                      const who = s.staffIds.map(staffName).join(", ");
                      return (
                        <li key={s.start}>
                          <Button
                            variant={suggested ? "default" : "outline"}
                            className={cn("h-11 w-full flex-col gap-0 tabular-nums", suggested && "ring-3 ring-brand-clay/50")}
                            disabled={!!pendingStart}
                            aria-busy={isPending}
                            aria-label={`${timeIn(s.start, timezone)} with ${who}${suggested ? " (suggested)" : ""}`}
                            onClick={() => {
                              setHighlight(undefined);
                              pick(s.start);
                            }}
                            data-slot-start={s.start}
                          >
                            {isPending ? <Spinner label="Holding this time" /> : <span>{timeIn(s.start, timezone)}</span>}
                            {staffId === "any" && !isPending ? <span className="text-[10px] font-normal opacity-75">{s.staffIds.length > 1 ? `${s.staffIds.length} available` : staffName(s.staffIds[0]!)}</span> : null}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden /> Times are in the studio&apos;s time zone. {mode.kind === "book" ? "Picking a time holds it for a few minutes while you confirm." : "Your current time stays booked until the move succeeds."}
        </p>
      </section>
    </div>
  );
}
