import { cn } from "@/lib/utils";
import { formatCell } from "@/lib/format";
import type { ResultView } from "./result-chart";

/** Semantic, scrollable table; numbers right-aligned. Shows at most `limit` rows. */
export function ResultTable({ result, limit = 200, className, caption }: { result: ResultView; limit?: number; className?: string; caption?: string }) {
  const shown = result.rows.slice(0, limit);
  return (
    <div className={cn("max-h-96 overflow-auto rounded-lg border", className)} tabIndex={0} role="region" aria-label={caption ?? "Query result"}>
      <table className="w-full text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
          <tr>
            {result.columns.map((c) => (
              <th key={c.name} scope="col" className={cn("px-3 py-2 font-medium whitespace-nowrap", c.kind === "number" && "text-right")}>
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((v, j) => (
                <td key={j} className={cn("px-3 py-1.5 whitespace-nowrap", result.columns[j]?.kind === "number" && "text-right tabular-nums")}>
                  {formatCell(v, result.columns[j]?.kind ?? "text")}
                </td>
              ))}
            </tr>
          ))}
          {shown.length === 0 ? (
            <tr>
              <td colSpan={Math.max(1, result.columns.length)} className="px-3 py-6 text-center text-muted-foreground">
                No rows.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {result.rows.length > limit || result.truncated ? (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Showing {shown.length} of {result.truncated ? `more than ${result.rowCount}` : result.rowCount} rows{result.truncated ? " (results are capped; export CSV for the capped set)" : ""}.
        </p>
      ) : null}
    </div>
  );
}
