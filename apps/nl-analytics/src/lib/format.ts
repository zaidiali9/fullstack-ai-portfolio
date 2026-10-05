/** Client-safe formatting for query results. */
export type Cell = string | number | boolean | null;

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatCell(v: Cell, kind: "number" | "text" | "date" | "boolean"): string {
  if (v === null) return "—";
  if (kind === "number" && typeof v === "number") return nf.format(v);
  if (kind === "date" && typeof v === "string") return v.length > 10 ? new Date(v).toLocaleString("en-US", { timeZone: "UTC" }) : v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

export const formatCompact = (n: number) => (Math.abs(n) >= 10_000 ? compact.format(n) : nf.format(n));

/** "snake_case" column names -> "Snake case" labels for charts and headers. */
export const label = (name: string) => {
  const s = name.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
