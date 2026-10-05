import type { Metadata } from "next";
import { Badge } from "@portfolio/ui/badge";
import { PageHeader } from "@portfolio/ui/page-header";
import { TimeAgo } from "@/components/time-ago";
import { requireAdminPage } from "@/server/access";
import { listRuns, runStats } from "@/server/queries";

export const metadata: Metadata = { title: "Activity", robots: { index: false } };

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Admin-only audit log: every query attempt, including ones the guard rejected, and AI usage. */
export default async function AdminPage() {
  await requireAdminPage();
  const [runs, stats] = await Promise.all([listRuns(100), runStats()]);
  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description="Every query attempt in the last 7 days, including SQL the guard rejected." className="pb-0" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Query attempts" value={stats.runs.total} />
        <Stat label="Succeeded" value={stats.runs.ok} />
        <Stat label="Rejected by the guard" value={stats.runs.rejected} />
        <Stat label="Database errors" value={stats.runs.errors} />
      </div>
      {stats.ai.length ? (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <caption className="px-4 pt-3 text-left text-sm font-medium">AI usage (7 days)</caption>
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Feature</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Calls</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Failed</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Avg latency</th>
              </tr>
            </thead>
            <tbody>
              {stats.ai.map((a) => (
                <tr key={a.feature} className="border-t">
                  <th scope="row" className="px-4 py-2 text-left font-mono text-xs font-normal">{a.feature}</th>
                  <td className="px-4 py-2 text-right tabular-nums">{a.calls}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{a.failed}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{(a.avgMs / 1000).toFixed(1)} s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <caption className="px-4 pt-3 text-left text-sm font-medium">Recent query attempts</caption>
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">When</th>
              <th scope="col" className="px-4 py-2 font-medium">Who / source</th>
              <th scope="col" className="px-4 py-2 font-medium">Question / SQL</th>
              <th scope="col" className="px-4 py-2 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="px-4 py-2 text-xs whitespace-nowrap text-muted-foreground">
                  <TimeAgo date={r.createdAt} />
                </td>
                <td className="px-4 py-2 text-xs whitespace-nowrap">
                  {r.userName ?? "public link"}
                  <span className="block text-muted-foreground">{r.source}</span>
                </td>
                <td className="max-w-md px-4 py-2">
                  {r.question ? <p className="text-xs">“{r.question}”</p> : null}
                  <code className="mt-1 block truncate font-mono text-[11px] text-muted-foreground" title={r.sql}>
                    {r.sql}
                  </code>
                </td>
                <td className="px-4 py-2 text-xs">
                  <Badge variant={r.status === "ok" ? "secondary" : r.status === "rejected" ? "outline" : "destructive"}>{r.status}</Badge>
                  <span className="mt-1 block text-muted-foreground">{r.status === "ok" ? `${r.rowCount} rows · ${r.durationMs} ms` : r.reason}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
