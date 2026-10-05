/** Client-safe formatting helpers. All times are shown in the studio's time zone. */

export const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

export const timeIn = (iso: string | Date, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export const dateIn = (iso: string | Date, tz: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(new Date(iso));

/** "YYYY-MM-DD" calendar date -> label (formatted as UTC so the day never shifts). */
export const dayLabel = (date: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(`${date}T12:00:00Z`));

export const hourIn = (iso: string | Date, tz: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date(iso)));

export const durationLabel = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}` : `${min} min`);

export const STATUS_LABEL: Record<string, string> = {
  held: "Held",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
};
