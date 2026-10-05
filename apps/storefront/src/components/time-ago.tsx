const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

export function timeAgo(date: Date, now = new Date()) {
  const diff = (date.getTime() - now.getTime()) / 1000;
  for (const [unit, secs] of UNITS) if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  return "just now";
}

export function TimeAgo({ date }: { date: Date }) {
  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString("en-US")}>
      {timeAgo(date)}
    </time>
  );
}
