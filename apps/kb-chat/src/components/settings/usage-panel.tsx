import { AiUnavailable } from "@portfolio/ui/ai-unavailable";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@portfolio/ui/table";
import { aiStatus } from "@/lib/ai";
import { questionsThisMonth } from "@/server/chat";
import { usageStats } from "@/server/workspaces";
import type { Workspace } from "@db/schema";

export async function UsagePanel({ ws }: { ws: Workspace }) {
  const [stats, asked] = await Promise.all([usageStats(ws.id), questionsThisMonth(ws.id)]);
  const status = aiStatus();
  const pct = Math.min(100, Math.round((asked / ws.monthlyQuestionLimit) * 100));
  const tiles = [
    { label: "Questions this month", value: `${asked} / ${ws.monthlyQuestionLimit}` },
    { label: "Documents", value: `${stats.documents} / ${ws.maxDocuments}` },
    { label: "Indexed passages", value: String(stats.chunks) },
  ];
  return (
    <div className="space-y-4">
      <ul className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.label} className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{t.value}</p>
          </li>
        ))}
      </ul>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Monthly questions used" aria-valuenow={asked} aria-valuemin={0} aria-valuemax={ws.monthlyQuestionLimit}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">
        Chat model: {status.chat ? `${status.chat.provider} · ${status.chat.model}` : <AiUnavailable />} · Embeddings:{" "}
        {status.embeddings ? `${status.embeddings.provider} · ${status.embeddings.model}` : <AiUnavailable reason="unavailable (keyword search)" />}
      </p>
      {stats.byFeature.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>AI calls this month</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Failures</TableHead>
                <TableHead className="text-right">Avg latency</TableHead>
                <TableHead className="text-right">Output tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.byFeature.map((r) => (
                <TableRow key={r.feature}>
                  <TableCell className="font-mono text-xs">{r.feature}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.calls}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.failures}</TableCell>
                  <TableCell className="text-right tabular-nums">{(r.avgMs / 1000).toFixed(1)} s</TableCell>
                  <TableCell className="text-right tabular-nums">{r.outputTokens}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
