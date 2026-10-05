"use client";
import { AlertTriangle, Download, LayoutDashboard, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { ChartSpec } from "@db/schema";
import { Badge } from "@portfolio/ui/badge";
import { Button, buttonVariants } from "@portfolio/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@portfolio/ui/dropdown-menu";
import { Input } from "@portfolio/ui/input";
import { Label } from "@portfolio/ui/label";
import { ActionButton } from "@/components/confirm-action-button";
import { ResultChart, type ResultView } from "@/components/results/result-chart";
import { ResultTable } from "@/components/results/result-table";
import { SqlPanel } from "@/components/results/sql-panel";
import { cn } from "@/lib/utils";
import { addTileAction, deleteQueryAction, updateQueryAction } from "@/server/actions/queries";

interface Props {
  query: { id: string; title: string; question: string; sql: string; chart: ChartSpec; source: string };
  result: ResultView | null;
  error: string | null;
  dashboards: { id: string; title: string; contains: boolean }[];
}

export function SavedQueryView({ query, result: initialResult, error: initialError, dashboards }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(query.title);
  const [sql, setSql] = useState(query.sql);
  const [chart, setChart] = useState<ChartSpec>(query.chart);
  const [result, setResult] = useState(initialResult);
  const [error, setError] = useState(initialError);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"chart" | "table">(query.chart.type === "table" ? "table" : "chart");
  const dirty = title !== query.title || sql !== query.sql || JSON.stringify(chart) !== JSON.stringify(query.chart);

  async function run(next: string) {
    setRunning(true);
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql: next, question: query.question || undefined, chart }) });
      const json = (await res.json()) as { result?: ResultView; chart?: ChartSpec; error?: { message?: string } };
      if (!res.ok || !json.result) throw new Error(json.error?.message ?? "The query failed.");
      setResult(json.result);
      setChart(json.chart!);
      setSql(json.result.sql);
      setError(null);
    } catch (err) {
      setSql(next);
      setError((err as Error).message);
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  async function saveChanges() {
    setSaving(true);
    const r = await updateQueryAction(query.id, { title, sql, chart });
    setSaving(false);
    if (!r.ok) return toast.error(r.message);
    toast.success("Changes saved.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="query-title" className="text-xs text-muted-foreground">
            Title
          </Label>
          <Input id="query-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className="h-10 max-w-xl font-heading text-lg font-semibold" />
          {query.question ? <p className="text-sm text-muted-foreground">“{query.question}”</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {dirty ? (
            <Button onClick={saveChanges} disabled={saving || !!error || !title.trim()} aria-busy={saving}>
              Save changes
            </Button>
          ) : null}
          <a href={`/api/queries/${query.id}/csv`} className={buttonVariants({ variant: "outline", size: "sm" })} download>
            <Download className="size-4" aria-hidden /> CSV
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <LayoutDashboard className="size-4" aria-hidden /> Add to dashboard
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Your dashboards</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {dashboards.length ? (
                dashboards.map((d) => (
                  <DropdownMenuItem
                    key={d.id}
                    disabled={d.contains}
                    onSelect={async () => {
                      const r = await addTileAction(d.id, query.id);
                      if (r.status === "error") toast.error(r.message ?? "Couldn't add it.");
                      else toast.success(`Added to “${d.title}”.`, { action: { label: "Open", onClick: () => router.push(`/dashboards/${d.id}`) } });
                    }}
                  >
                    <span className="truncate">{d.title}</span>
                    {d.contains ? <span className="ml-auto text-xs text-muted-foreground">added</span> : null}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem asChild>
                  <Link href="/dashboards">Create a dashboard first</Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <ActionButton variant="ghost" size="sm" action={deleteQueryAction.bind(null, query.id)} confirm="Delete this saved query? It will also disappear from dashboards." aria-label="Delete query">
            <Trash2 className="size-4" aria-hidden />
          </ActionButton>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{query.source === "ai" ? "AI-generated SQL (reviewable)" : "Hand-written SQL"}</Badge>
        {result ? (
          <Badge variant="outline">
            {result.rowCount}
            {result.truncated ? "+" : ""} rows · {result.durationMs} ms
          </Badge>
        ) : null}
      </div>

      <section className={cn("space-y-3 rounded-xl border bg-card p-4", running && "opacity-60")} aria-busy={running} aria-label="Result">
        {error ? (
          <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
          </p>
        ) : null}
        {result ? (
          <>
            <div role="tablist" aria-label="Result view" className="inline-flex rounded-lg border p-0.5">
              {(["chart", "table"] as const).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("rounded-md px-3 py-1 text-sm capitalize", view === v ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}>
                  {v}
                </button>
              ))}
            </div>
            {view === "chart" && chart.type !== "table" ? <ResultChart spec={chart} result={result} /> : <ResultTable result={result} caption={title} />}
          </>
        ) : null}
      </section>

      <SqlPanel sql={sql} onRun={run} running={running} note={dirty ? "Edited SQL is checked by the same guard. Press “Save changes” to keep it." : undefined} />
    </div>
  );
}
