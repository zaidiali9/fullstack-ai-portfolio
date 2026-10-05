"use client";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AiUnavailable } from "@portfolio/ui/ai-unavailable";
import { Badge } from "@portfolio/ui/badge";
import { Button, buttonVariants } from "@portfolio/ui/button";
import { Label } from "@portfolio/ui/label";
import { Spinner } from "@portfolio/ui/spinner";
import { Textarea } from "@portfolio/ui/textarea";
import { cn } from "@/lib/utils";
import { dateIn, dayLabel, timeIn } from "@/lib/format";

interface NlResult {
  interpretation: {
    service: { id: string; slug: string; name: string } | null;
    staff: { id: string; name: string } | null;
    dates: { from: string; to: string; label: string; explicit: boolean };
    time: string | null;
  };
  options: { start: string; staffId: string; staffName: string }[];
  notes: string[];
  model: { provider: string; model: string };
}

const EXAMPLES = ["Deep tissue massage with Sam next Tuesday after 4pm", "Something for my sore shoulders tomorrow morning", "A facial this weekend"];

/**
 * Natural-language booking search. The model only turns the request into filters; the times shown
 * are real openings from the availability engine, and nothing is booked until the customer picks one.
 */
export function AssistantBox({ aiAvailable, services, timezone }: { aiAvailable: boolean; services: { slug: string; name: string }[]; timezone: string }) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NlResult | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending || text.trim().length < 3) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: text }) });
      const json = (await res.json().catch(() => null)) as (NlResult & { error?: { message?: string } }) | null;
      if (!res.ok || !json) throw new Error(json?.error?.message ?? "The assistant couldn't answer. Use the booking buttons below instead.");
      setResult(json);
    } catch (err) {
      setResult(null);
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  const i = result?.interpretation;
  const dateText = i ? (i.dates.from === i.dates.to ? dayLabel(i.dates.from) : `${dayLabel(i.dates.from, { month: "short", day: "numeric" })} – ${dayLabel(i.dates.to, { month: "short", day: "numeric" })}`) : "";

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="assistant" className="flex items-center gap-1.5 text-base font-medium">
            <Sparkles className="size-4 text-brand-clay" aria-hidden /> Describe what you&apos;d like
          </Label>
          {!aiAvailable ? <AiUnavailable /> : null}
        </div>
        <Textarea
          id="assistant"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder={EXAMPLES[0]}
          disabled={!aiAvailable}
          aria-describedby="assistant-help"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id="assistant-help" className="text-xs text-muted-foreground">
            {aiAvailable ? "AI reads your request and finds real open times. Nothing is booked until you pick one." : "The assistant needs an AI provider. You can still book with the buttons below."}
          </p>
          <Button type="submit" disabled={!aiAvailable || pending || text.trim().length < 3} aria-busy={pending}>
            {pending ? <Spinner label="Finding times" /> : null}
            Find times
          </Button>
        </div>
        {aiAvailable && !result && !pending ? (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
                {ex}
              </button>
            ))}
          </div>
        ) : null}
      </form>

      <div aria-live="polite" className="empty:hidden">
        {error ? <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        {result && i ? (
          <div className="mt-4 space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">Understood:</span>
              <Badge variant={i.service ? "secondary" : "outline"}>{i.service?.name ?? "Service?"}</Badge>
              <Badge variant="secondary">{i.staff ? `with ${i.staff.name.split(" ")[0]}` : "anyone"}</Badge>
              <Badge variant="secondary" title={i.dates.explicit ? "Parsed from your request" : "No date mentioned"}>
                {i.dates.explicit ? dateText : `${i.dates.label} (${dateText})`}
              </Badge>
              {i.time ? <Badge variant="secondary">{i.time}</Badge> : null}
            </div>
            {result.notes.map((n) => (
              <p key={n} className="text-sm text-muted-foreground">
                {n}
              </p>
            ))}
            {!i.service ? (
              <div className="flex flex-wrap gap-2">
                {services.map((s) => (
                  <Link key={s.slug} href={`/book/${s.slug}?date=${i.dates.from}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    {s.name}
                  </Link>
                ))}
              </div>
            ) : result.options.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {result.options.map((o) => {
                  const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(o.start));
                  const q = new URLSearchParams({ staff: i.staff ? o.staffId : "any", date, time: o.start });
                  return (
                    <li key={o.start + o.staffId}>
                      <Link
                        href={`/book/${i.service!.slug}?${q}`}
                        className={cn(buttonVariants({ variant: "outline" }), "h-auto w-full justify-between py-2 text-left")}
                      >
                        <span>
                          <span className="block font-medium">
                            {dateIn(o.start, timezone, { weekday: "short", month: "short", day: "numeric" })} · {timeIn(o.start, timezone)}
                          </span>
                          <span className="block text-xs text-muted-foreground">with {o.staffName}</span>
                        </span>
                        <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              Interpreted by AI ({result.model.provider} · {result.model.model}) — check the details before booking. Dates are worked out by the app, not the model.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
