"use client";
import { ArrowUp, FileText, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { readTextStream } from "@portfolio/ai/stream";
import { AiUnavailable } from "@portfolio/ui/ai-unavailable";
import { Button } from "@portfolio/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@portfolio/ui/dialog";
import { Spinner } from "@portfolio/ui/spinner";
import { Textarea } from "@portfolio/ui/textarea";
import { cn } from "@/lib/utils";

export interface UiSource {
  n: number;
  chunkId: string;
  documentId: string;
  title: string;
  page: number | null;
  snippet?: string;
  method?: "model" | "matched";
}

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "ok" | "refused" | "error" | "streaming";
  sources: UiSource[];
}

interface Props {
  /** POST endpoint returning a text stream (app chat or widget chat). */
  endpoint: string;
  /** Endpoint prefix for loading a cited chunk's full text; omitted in the widget (snippets only). */
  chunkEndpoint?: string;
  initialConversationId?: string;
  initialMessages: UiMessage[];
  aiAvailable: boolean;
  /** Called with the new conversation id after the first answer (app: update the URL). */
  onConversation?: (id: string) => void;
  greeting?: string;
  suggestions?: string[];
  compact?: boolean;
}

/** Answer text with [n] markers rendered as buttons that open the cited passage. */
function CitedText({ text, sources, onOpen }: { text: string; sources: UiSource[]; onOpen: (s: UiSource) => void }) {
  const parts = text.split(/(\[\d{1,2}(?:\s*,\s*\d{1,2})*\])/g);
  return (
    <p className="leading-relaxed break-words whitespace-pre-wrap">
      {parts.map((part, i) => {
        const nums = /^\[[\d,\s]+\]$/.test(part) ? (part.match(/\d+/g) ?? []).map(Number) : null;
        if (!nums) return <span key={i}>{part}</span>;
        return nums.map((n) => {
          const s = sources.find((x) => x.n === n);
          return s ? (
            <button
              key={`${i}-${n}`}
              type="button"
              onClick={() => onOpen(s)}
              className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-primary/10 px-1 align-text-top text-xs font-semibold text-primary hover:bg-primary/20 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label={`Source ${n}: ${s.title}${s.page ? `, page ${s.page}` : ""}`}
            >
              {n}
            </button>
          ) : (
            <span key={`${i}-${n}`}>[{n}]</span>
          );
        });
      })}
    </p>
  );
}

export function ChatPanel({ endpoint, chunkEndpoint, initialConversationId, initialMessages, aiAvailable, onConversation, greeting, suggestions = [], compact }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<UiSource | null>(null);
  const [openText, setOpenText] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function openSource(s: UiSource) {
    setOpen(s);
    setOpenText(s.snippet ?? null);
    if (!chunkEndpoint) return;
    const res = await fetch(`${chunkEndpoint}/${s.chunkId}`);
    if (res.ok) setOpenText(((await res.json()) as { content: string }).content);
  }

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    setBusy(true);
    const n = ++seq.current;
    const assistantId = `a-${n}`;
    setMessages((m) => [...m, { id: `u-${n}`, role: "user", content: q, status: "ok", sources: [] }, { id: assistantId, role: "assistant", content: "", status: "streaming", sources: [] }]);
    const controller = new AbortController();
    abortRef.current = controller;
    const update = (patch: Partial<UiMessage>) => setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, ...patch } : x)));
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, conversationId }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        const msg = body?.error?.message ?? "Something went wrong. Please try again.";
        setMessages((m) => m.filter((x) => x.id !== assistantId));
        setError(msg);
        return;
      }
      const id = res.headers.get("x-conversation-id");
      const sources = JSON.parse(decodeURIComponent(res.headers.get("x-sources") ?? "%5B%5D")) as UiSource[];
      update({ sources });
      if (id && id !== conversationId) {
        setConversationId(id);
        onConversation?.(id);
      }
      let meta: { content: string; status: "ok" | "refused"; citations: UiSource[] } | undefined;
      const text = await readTextStream(
        res,
        (t) => update({ content: t }),
        (m) => (meta = m as typeof meta),
      );
      // The trailer carries the stored answer (with any automatically matched citations).
      if (meta) update({ content: meta.content, status: meta.status, sources: meta.citations.length ? meta.citations : sources });
      else update({ content: text, status: /couldn['’]t find this in the documents/i.test(text) ? "refused" : "ok" });
      if (!compact) router.refresh();
    } catch (err) {
      if ((err as Error).name === "AbortError") update({ status: "ok" });
      else {
        update({ status: "error", content: (err as { partial?: string }).partial ?? "" });
        setError((err as Error).message || "The answer was interrupted.");
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("flex-1 space-y-5 overflow-y-auto", compact ? "p-3" : "pb-4")} aria-live="polite" aria-busy={busy}>
        {messages.length === 0 ? (
          <div className="mx-auto max-w-lg py-10 text-center">
            <p className="text-lg font-semibold">{greeting ?? "Ask anything about your documents"}</p>
            <p className="mt-1 text-sm text-muted-foreground">Answers only use your uploaded documents and link every claim to its source.</p>
            {suggestions.length ? (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <Button key={s} variant="outline" size="sm" className="h-auto py-1.5 whitespace-normal" onClick={() => send(s)} disabled={!aiAvailable || busy}>
                    {s}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[92%] rounded-2xl px-4 py-3 text-sm sm:max-w-[80%]",
                m.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card",
                m.status === "refused" && "border-dashed bg-muted/40",
              )}
            >
              {m.role === "assistant" ? (
                <>
                  {m.content ? <CitedText text={m.content} sources={m.sources} onOpen={openSource} /> : <Spinner label="Thinking" />}
                  {m.status === "refused" ? <p className="mt-2 text-xs text-muted-foreground">No relevant passage was found, so nothing was made up.</p> : null}
                  {m.status === "streaming" && m.sources.length ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Answering from {m.sources.length} passage{m.sources.length === 1 ? "" : "s"}…
                    </p>
                  ) : null}
                  {m.sources.length && m.status !== "refused" && m.status !== "streaming" && m.content ? (
                    <div className="mt-3 border-t pt-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Sources
                        {m.sources.some((s) => s.method === "matched") ? " · some citations were matched automatically to the passage containing the sentence" : ""}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {m.sources.map((s) => (
                          <li key={s.chunkId}>
                            <button type="button" onClick={() => openSource(s)} className="flex items-start gap-1.5 text-left text-xs hover:underline focus-visible:underline focus-visible:outline-none">
                              <span className="font-semibold text-primary">[{s.n}]</span>
                              <FileText className="mt-0.5 size-3 shrink-0" aria-hidden />
                              <span>
                                {s.title}
                                {s.page ? `, p. ${s.page}` : ""}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error ? (
        <p role="alert" className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <form
        className={cn("relative rounded-2xl border bg-card shadow-sm focus-within:ring-3 focus-within:ring-ring/40", compact && "m-3 mt-0")}
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <Textarea
          id="question"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder={aiAvailable ? "Ask a question… (Enter to send, Shift+Enter for a new line)" : "AI unavailable"}
          disabled={!aiAvailable}
          maxLength={1000}
          rows={compact ? 1 : 2}
          className="min-h-0 resize-none border-0 bg-transparent pr-14 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="absolute right-2 bottom-2">
          {busy ? (
            <Button type="button" size="icon" variant="secondary" onClick={() => abortRef.current?.abort()} aria-label="Stop generating">
              <Square className="size-3.5" aria-hidden />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!aiAvailable || !input.trim()} aria-label="Send question">
              <ArrowUp className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </form>
      {!aiAvailable ? (
        <div className="mt-2">
          <AiUnavailable reason="AI unavailable: no model provider is configured on this server" />
        </div>
      ) : null}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              [{open?.n}] {open?.title}
            </DialogTitle>
            <DialogDescription>{open?.page ? `Page ${open.page}` : "Passage used for this answer"}</DialogDescription>
          </DialogHeader>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{openText ?? "Loading…"}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
