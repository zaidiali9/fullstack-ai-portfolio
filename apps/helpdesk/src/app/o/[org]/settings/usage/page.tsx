import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import { AiUnavailable } from "@portfolio/ui/ai-unavailable";
import { EmptyState } from "@portfolio/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@portfolio/ui/table";
import { aiStatus } from "@/lib/ai";
import { requireOrgPage } from "@/server/authz";
import { usageSummary } from "@/server/usage";

export const metadata: Metadata = { title: "AI usage" };

export default async function UsagePage({ params }: PageProps<"/o/[org]/settings/usage">) {
  const { org } = await params;
  const ctx = await requireOrgPage(org, "usage:read");
  const usage = await usageSummary(ctx);
  const status = aiStatus();
  const pct = Math.min(100, Math.round((usage.today / usage.limit) * 100));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border bg-card p-5" aria-labelledby="quota-h">
          <h2 id="quota-h" className="text-sm text-muted-foreground">
            AI calls today
          </h2>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {usage.today} <span className="text-base font-normal text-muted-foreground">/ {usage.limit}</span>
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={usage.today} aria-valuemin={0} aria-valuemax={usage.limit} aria-label="Daily AI quota used">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground capitalize">{ctx.org.plan} plan daily limit</p>
        </section>
        <section className="rounded-xl border bg-card p-5" aria-labelledby="provider-h">
          <h2 id="provider-h" className="text-sm text-muted-foreground">
            Configured models
          </h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex flex-wrap gap-2">
              <dt className="text-muted-foreground">Chat:</dt>
              <dd>{status.chat ? `${status.chat.provider} · ${status.chat.model}` : <AiUnavailable />}</dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="text-muted-foreground">Embeddings:</dt>
              <dd>{status.embeddings ? `${status.embeddings.provider} · ${status.embeddings.model}` : <AiUnavailable reason="Unavailable (keyword search)" />}</dd>
            </div>
          </dl>
        </section>
      </div>
      {usage.byFeature.length === 0 ? (
        <EmptyState icon={BarChart3} title="No AI usage in the last 30 days" description="Usage appears here once tickets are triaged or agents use drafts and summaries." />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Feature (last 30 days)</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Failures</TableHead>
                <TableHead className="text-right">Avg latency</TableHead>
                <TableHead className="text-right">Output tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.byFeature.map((r) => (
                <TableRow key={r.feature}>
                  <TableCell className="font-mono text-xs">{r.feature}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.calls}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.failures}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.avgLatencyMs !== null ? `${(r.avgLatencyMs / 1000).toFixed(1)} s` : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.outputTokens}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
