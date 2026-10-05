import type { QueryResult } from "./sql/execute";

/**
 * RFC 4180 CSV. Text cells that a spreadsheet would treat as a formula (=, +, -, @, tab, CR) are
 * prefixed with an apostrophe (CSV/formula injection, OWASP). Numbers are written as numbers.
 */
export function toCsv(result: Pick<QueryResult, "columns" | "rows">): string {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "number" || typeof v === "boolean" ? String(v) : String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [result.columns.map((c) => cell(c.name)).join(","), ...result.rows.map((r) => r.map(cell).join(","))];
  return `${lines.join("\r\n")}\r\n`;
}

export function csvResponse(result: Pick<QueryResult, "columns" | "rows">, name: string) {
  const file = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "query"}.csv`;
  // A UTF-8 BOM so Excel opens non-ASCII text correctly.
  return new Response(`﻿${toCsv(result)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
