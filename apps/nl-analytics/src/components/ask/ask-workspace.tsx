"use client";
import { AlertTriangle, Download, Save, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { ChartSpec } from "@db/schema";
import { readTextStream } from "@portfolio/ai/stream";
import { AiUnavailable } from "@portfolio/ui/ai-unavailable";
import { Badge } from "@portfolio/ui/badge";
import { Button } from "@portfolio/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@portfolio/ui/dialog";
import { Input } from "@portfolio/ui/input";
import { Label } from "@portfolio/ui/label";
import { Spinner } from "@portfolio/ui/spinner";
import { Textarea } from "@portfolio/ui/textarea";
import { ResultChart, type ResultView } from "@/components/results/result-chart";
import { ResultTable } from "@/components/results/result-table";
import { SqlPanel } from "@/components/results/sql-panel";
import { cn } from "@/lib/utils";
import { saveQueryAction } from "@/server/actions/queries";

const EXAMPLES = [
  "Monthly revenue from completed orders",
  "Top 10 products by units sold",
  "Revenue by region in the last 90 days",
  "Average support satisfaction by ticket category",
  "How many new customers signed up each month?",
];
const CHART_TYPES: ChartSpec["type"][] = ["bar", "line", "area", "pie", "number", "table"];

interface Answer {
  question: string;
  title: string;
  sql: string;
  explanation: string;
  source: "ai" | "manual";
  attempts?: number;
  model?: { provider: string; model: string };
  chart: ChartSpec;
  result: ResultView | null;
  error: string | null;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok || !json) throw new Error(json?.error?.message ?? "Something went wrong. Please try again.");
  return json;
}

/** Pick sensible x/y when the user switches chart type on a result. */
function retype(spec: ChartSpec, type: ChartSpec["type"], result: ResultView): ChartSpec {
  const numeric = result.columns.filter((c) => c.kind === "number").map((c) => c.name);
  const x = spec.x ?? result.columns.find((c) => c.kind !== "number")?.name ?? result.columns[0]?.name ?? null;
  const y = spec.y?.length ? spec.y : numeric.filter((n) => n !== x).slice(0, 2);
  return type === "number" ? { type, x: null, y: y.slice(0, 1) } : { type, x, y };
}

export function AskWorkspace({ aiAvailable, initialQuestion }: { aiAvailable: boolean; initialQuestion?: string }) {
  const [question, setQuestion] = useState(initialQuestion ?? "");
  const [phase, setPhase] = useState<"idle" | "asking" | "running">("idle");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [summary, setSummary] = useState<{ text: string; unverified: string[] | null; model?: string; error?: string; pending: boolean } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const autoAsked = useRef(false);
  const router = useRouter();

  async function ask(q: string) {
    if (q.trim().length < 3 || phase !== "idle") return;
    setPhase("asking");
    setSummary(null);
    try {
      type AskResponse =
        | { ok: true; question: string; title: string; sql: string; explanation: string; attempts: number; model: { provider: string; model: string }; chart: ChartSpec; result: ResultView }
        | { ok: false; question: string; title: string; sql: string; explanation: string; attempts: number; model: { provider: string; model: string }; code: string; error: string };
      const r = await postJson<AskResponse>("/api/ask", { question: q });
      setAnswer({
        question: r.question,
        title: r.title,
        sql: r.sql,
        explanation: r.explanation,
        source: "ai",
        attempts: r.attempts,
        model: r.model,
        chart: r.ok ? r.chart : { type: "table", x: null, y: [] },
        result: r.ok ? r.result : null,
        error: r.ok ? null : r.error,
      });
      setView(r.ok && r.chart.type === "table" ? "table" : "chart");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPhase("idle");
    }
  }

  async function run(sql: string) {
    setPhase("running");
    setSummary(null);
    try {
      const r = await postJson<{ result: ResultView; chart: ChartSpec }>("/api/run", { sql, question: answer?.question || question || undefined, chart: answer?.chart });
      setAnswer((a) => ({
        question: a?.question ?? question,
        title: a?.title && a.title !== "Query result" ? a.title : "Query result",
        sql: r.result.sql,
        explanation: a?.sql === r.result.sql ? (a?.explanation ?? "") : "Edited by you.",
        source: a?.sql === r.result.sql ? (a?.source ?? "manual") : "manual",
        attempts: a?.attempts,
        model: a?.model,
        chart: r.chart,
        result: r.result,
        error: null,
      }));
      setView(r.chart.type === "table" ? "table" : "chart");
    } catch (err) {
      setAnswer((a) => (a ? { ...a, sql, result: null, error: (err as Error).message, source: "manual" } : { question, title: "Query", sql, explanation: "", source: "manual", chart: { type: "table", x: null, y: [] }, result: null, error: (err as Error).message }));
    } finally {
      setPhase("idle");
    }
  }

  useEffect(() => {
    if (initialQuestion && aiAvailable && !autoAsked.current) {
      autoAsked.current = true;
      void ask(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportCsv() {
    if (!answer?.result) return;
    const res = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql: answer.sql, title: answer.title }) });
    if (!res.ok) return toast.error("Export failed.");
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: `${answer.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "query"}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function summarize() {
    if (!answer?.result) return;
    setSummary({ text: "", unverified: null, pending: true });
    try {
      const res = await fetch("/api/summarize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: answer.question || answer.title, sql: answer.sql }) });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(json?.error?.message ?? "Couldn't summarize.");
      }
      await readTextStream(
        res,
        (t) => setSummary((s) => ({ ...(s ?? { unverified: null, pending: true }), text: t })),
        (m) => {
          const meta = m as { unverified: string[]; provider: string; model: string };
          setSummary((s) => ({ ...(s ?? { text: "", pending: true }), unverified: meta.unverified, model: `${meta.provider} · ${meta.model}` }));
        },
      );
      setSummary((s) => (s ? { ...s, pending: false } : s));
    } catch (err) {
      setSummary({ text: "", unverified: null, error: (err as Error).message, pending: false });
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!answer?.result) return;
    setSaving(true);
    const r = await saveQueryAction({ title, question: answer.question, sql: answer.sql, chart: answer.chart, source: answer.source });
    setSaving(false);
    if (!r.ok) return toast.error(r.message);
    setSaveOpen(false);
    toast.success("Query saved.", { action: { label: "Open", onClick: () => router.push(`/queries/${r.data.id}`) } });
  }

  const busy = phase !== "idle";
  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="rounded-xl border bg-card p-4 shadow-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="question" className="flex items-center gap-1.5 text-base font-medium">
            <Sparkles className="size-4 text-brand-clay" aria-hidden /> Ask a question about the data
          </Label>
          {!aiAvailable ? <AiUnavailable /> : null}
        </div>
        <Textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          rows={2}
          className="mt-3"
          placeholder={EXAMPLES[0]}
          disabled={!aiAvailable}
          aria-describedby="question-help"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p id="question-help" className="text-xs text-muted-foreground">
            {aiAvailable ? "AI writes the SQL; it's checked and run read-only on the demo dataset. You can always see and edit it." : "No AI provider is configured. You can still write SQL below and use saved queries and dashboards."}
          </p>
          <Button type="submit" disabled={!aiAvailable || busy || question.trim().length < 3} aria-busy={phase === "asking"}>
            {phase === "asking" ? <Spinner label="Writing SQL" /> : <Wand2 className="size-4" aria-hidden />}
            {phase === "asking" ? "Writing SQL…" : "Ask"}
          </Button>
        </div>
        {aiAvailable ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" disabled={busy} onClick={() => (setQuestion(ex), void ask(ex))} className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
                {ex}
              </button>
            ))}
          </div>
        ) : null}
      </form>

      <div aria-live="polite" aria-busy={busy}>
        {phase === "asking" && !answer ? (
          <div className="rounded-xl border p-6 text-sm text-muted-foreground">
            <Spinner label="" /> Writing and checking SQL… a local model can take 20–60 seconds.
          </div>
        ) : null}

        {!answer && !busy && !aiAvailable ? <SqlPanel sql="" startEditing onRun={run} running={busy} note="Example: SELECT status, count(*) AS orders FROM demo.orders GROUP BY status" /> : null}

        {answer ? (
          <article className={cn("space-y-4 rounded-xl border bg-card p-4 sm:p-5", busy && "opacity-60")} aria-labelledby="answer-title">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="answer-title" className="font-heading text-xl font-semibold">
                  {answer.title}
                </h2>
                {answer.question ? <p className="text-sm text-muted-foreground">“{answer.question}”</p> : null}
              </div>
              {answer.result ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => (setTitle(answer.title), setSaveOpen(true))}>
                    <Save className="size-4" aria-hidden /> Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportCsv}>
                    <Download className="size-4" aria-hidden /> CSV
                  </Button>
                  {aiAvailable ? (
                    <Button variant="outline" size="sm" onClick={summarize} disabled={summary?.pending}>
                      <Sparkles className="size-4" aria-hidden /> Summarize
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </header>

            <div className="flex flex-wrap gap-1.5 text-xs">
              {answer.source === "ai" && answer.model ? <Badge variant="secondary">AI-generated SQL · {answer.model.provider}</Badge> : <Badge variant="secondary">Your SQL</Badge>}
              {answer.attempts && answer.attempts > 1 ? (
                <Badge variant="outline">{answer.result ? `Fixed after ${answer.attempts - 1} automatic retr${answer.attempts > 2 ? "ies" : "y"}` : `${answer.attempts} attempts`}</Badge>
              ) : null}
              {answer.result ? (
                <Badge variant="outline">
                  {answer.result.rowCount}
                  {answer.result.truncated ? "+" : ""} rows · {answer.result.durationMs} ms
                </Badge>
              ) : null}
            </div>

            {answer.error ? (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  {answer.error}
                  {answer.sql ? " You can edit the SQL below and run it again." : ""}
                </p>
              </div>
            ) : null}

            {answer.result ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div role="tablist" aria-label="Result view" className="inline-flex rounded-lg border p-0.5">
                    {(["chart", "table"] as const).map((v) => (
                      <button
                        key={v}
                        role="tab"
                        aria-selected={view === v}
                        onClick={() => setView(v)}
                        className={cn("rounded-md px-3 py-1 text-sm capitalize", view === v ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  {view === "chart" ? (
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      Chart type
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
                        value={answer.chart.type}
                        onChange={(e) => setAnswer((a) => (a && a.result ? { ...a, chart: retype(a.chart, e.target.value as ChartSpec["type"], a.result) } : a))}
                      >
                        {CHART_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                {view === "chart" && answer.chart.type !== "table" ? <ResultChart spec={answer.chart} result={answer.result} /> : <ResultTable result={answer.result} caption={answer.title} />}
              </>
            ) : null}

            {answer.explanation ? <p className="text-sm text-muted-foreground">{answer.explanation}</p> : null}

            {summary ? (
              <section className="rounded-lg border bg-accent/30 p-3 text-sm" aria-label="AI summary">
                {summary.error ? <p className="text-destructive">{summary.error}</p> : null}
                {summary.text ? <p className="whitespace-pre-wrap">{summary.text}</p> : summary.pending ? <Spinner label="Summarizing" /> : null}
                {summary.unverified?.length ? (
                  <p className="mt-2 flex items-start gap-1.5 text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Check these numbers — they don&apos;t appear in the result: <strong>{summary.unverified.join(", ")}</strong>
                  </p>
                ) : summary.unverified ? (
                  <p className="mt-2 text-xs text-muted-foreground">Every number in this summary appears in the result.</p>
                ) : null}
                {summary.model ? <p className="mt-1 text-[11px] text-muted-foreground">AI-generated by {summary.model}.</p> : null}
              </section>
            ) : null}

            <SqlPanel sql={answer.sql} onRun={run} running={phase === "running"} startEditing={!answer.sql && !!answer.error} />
          </article>
        ) : null}
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <form onSubmit={save} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Save query</DialogTitle>
              <DialogDescription>Saved queries re-run on fresh data and can be added to dashboards.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="save-title">Title</Label>
              <Input id="save-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !title.trim()} aria-busy={saving}>
                {saving ? <Spinner label="Saving" /> : null} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        Data: {""}
        <Link href="/#dataset" className="underline underline-offset-4">
          Lanternfish Supply Co.
        </Link>{" "}
        — a fictional online retailer (seed data).
      </p>
    </div>
  );
}
