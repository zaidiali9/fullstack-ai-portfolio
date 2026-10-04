"use client";
import { ListChecks } from "lucide-react";
import { useRef, useState } from "react";
import { readTextStream } from "@portfolio/ai/stream";
import { AiUnavailable } from "@portfolio/ui/ai-unavailable";
import { Button } from "@portfolio/ui/button";
import { Spinner } from "@portfolio/ui/spinner";

export function SummaryPanel({ orgSlug, number, aiAvailable }: { orgSlug: string; number: number; aiAvailable: boolean }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);

  async function run() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    setText("");
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/tickets/${number}/summary`, { method: "POST" });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(err?.error?.message ?? "Couldn't summarize this thread.");
        return;
      }
      await readTextStream(res, setText);
    } catch (err) {
      setError((err as Error).message || "The summary was interrupted.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-4" aria-labelledby="summary-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="summary-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          <ListChecks className="size-4" aria-hidden /> Thread summary
        </h2>
        {aiAvailable ? (
          <Button size="sm" variant="ghost" onClick={run} disabled={loading}>
            {loading ? <Spinner /> : null}
            {text ? "Refresh" : "Summarize"}
          </Button>
        ) : (
          <AiUnavailable />
        )}
      </div>
      <div aria-live="polite" className="mt-2 text-sm">
        {error ? <p className="text-destructive">{error}</p> : null}
        {text ? <div className="whitespace-pre-wrap text-muted-foreground">{text}</div> : null}
        {!text && !error && !loading ? <p className="text-xs text-muted-foreground">Get a quick handover summary of this conversation.</p> : null}
      </div>
    </section>
  );
}
