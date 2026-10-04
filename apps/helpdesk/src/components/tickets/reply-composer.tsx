"use client";
import { BookOpenText, Sparkles, Square } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { toast } from "sonner";
import { readTextStream } from "@portfolio/ai/stream";
import { AiUnavailable } from "@portfolio/ui/ai-unavailable";
import { Button } from "@portfolio/ui/button";
import { Label } from "@portfolio/ui/label";
import { Spinner } from "@portfolio/ui/spinner";
import { Switch } from "@portfolio/ui/switch";
import { Textarea } from "@portfolio/ui/textarea";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { idle, type FormState } from "@/lib/form-state";
import { replyAction } from "@/server/actions/tickets";

interface Source {
  ref: string;
  id: string;
  title: string;
  method: "vector" | "fulltext";
}

export function ReplyComposer({ orgSlug, number, isStaff, aiAvailable }: { orgSlug: string; number: number; isStaff: boolean; aiAvailable: boolean }) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [aiAssisted, setAiAssisted] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [sources, setSources] = useState<Source[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Wrap the server action so the composer resets right after a successful send.
  const [state, formAction] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await replyAction(orgSlug, number, prev, fd);
    if (res.status === "success") {
      toast.success(res.message ?? "Sent");
      setBody("");
      setAiAssisted(false);
      setSources(null);
    } else if (res.status === "error" && !res.fieldErrors) toast.error(res.message ?? "Couldn't send");
    return res;
  }, idle);

  async function draft() {
    const controller = new AbortController();
    abortRef.current = controller;
    setDrafting(true);
    setSources(null);
    setBody("");
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/tickets/${number}/draft`, { method: "POST", signal: controller.signal });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(err?.error?.message ?? "Couldn't draft a reply");
        return;
      }
      const header = res.headers.get("x-ai-sources");
      if (header) setSources(JSON.parse(decodeURIComponent(header)) as Source[]);
      await readTextStream(res, (text) => setBody(text));
      setAiAssisted(true);
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast.error((err as Error).message || "The draft was interrupted");
    } finally {
      setDrafting(false);
      abortRef.current = null;
    }
  }

  return (
    <form action={formAction} className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <Label htmlFor="reply-body" className="text-sm font-medium">
          {internal ? "Internal note (agents only)" : isStaff ? "Reply to customer" : "Add a reply"}
        </Label>
        {isStaff ? (
          aiAvailable ? (
            drafting ? (
              <Button type="button" size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>
                <Square className="size-3" aria-hidden /> Stop
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={draft} disabled={internal}>
                <Sparkles className="size-3.5" aria-hidden /> Draft with AI
              </Button>
            )
          ) : (
            <AiUnavailable />
          )
        ) : null}
      </div>
      <div className="p-4">
        <Textarea
          id="reply-body"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          required
          maxLength={10000}
          placeholder={internal ? "Visible to agents and admins only" : "Write your reply…"}
          aria-invalid={!!state.fieldErrors?.body}
          aria-describedby="reply-error"
          aria-busy={drafting}
          className={internal ? "bg-amber-50/60 dark:bg-amber-950/20" : undefined}
        />
        <FieldError id="reply-error" errors={state.fieldErrors?.body} />
        <div aria-live="polite" className="mt-2 text-xs text-muted-foreground">
          {drafting ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner /> Drafting from your knowledge base…
            </span>
          ) : aiAssisted ? (
            <span>AI draft — review and edit before sending. Nothing is sent automatically.</span>
          ) : null}
        </div>
        {sources ? (
          <div className="mt-2 rounded-md bg-muted/60 p-2.5 text-xs">
            <p className="flex items-center gap-1 font-medium">
              <BookOpenText className="size-3.5" aria-hidden /> Articles given to the model
            </p>
            {sources.length ? (
              <ul className="mt-1 space-y-0.5">
                {sources.map((s) => (
                  <li key={s.id}>
                    <a className="underline-offset-2 hover:underline" href={`/o/${orgSlug}/kb/${s.id}`} target="_blank" rel="noreferrer">
                      [{s.ref}] {s.title}
                    </a>{" "}
                    <span className="text-muted-foreground">({s.method === "vector" ? "semantic match" : "keyword match"})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">No relevant articles found — the draft should ask a clarifying question rather than answer.</p>
            )}
          </div>
        ) : null}
        <input type="hidden" name="aiAssisted" value={String(aiAssisted)} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {isStaff ? (
            <div className="flex items-center gap-2">
              <Switch id="internal" name="internal" checked={internal} onCheckedChange={setInternal} />
              <Label htmlFor="internal" className="text-sm font-normal">
                Internal note
              </Label>
            </div>
          ) : (
            <span />
          )}
          <SubmitButton disabled={drafting || body.trim().length === 0} pendingText="Sending">
            {internal ? "Add note" : "Send reply"}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
