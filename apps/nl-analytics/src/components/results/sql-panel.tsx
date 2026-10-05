"use client";
import { Check, Copy, Pencil, Play, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@portfolio/ui/button";
import { Label } from "@portfolio/ui/label";
import { Spinner } from "@portfolio/ui/spinner";
import { Textarea } from "@portfolio/ui/textarea";

/**
 * The generated SQL, always visible. "Edit" lets the user change it and run it through the same
 * guard; nothing here can bypass server-side checks.
 */
export function SqlPanel({
  sql,
  onRun,
  running = false,
  editable = true,
  startEditing = false,
  note,
}: {
  sql: string;
  onRun?: (sql: string) => void;
  running?: boolean;
  editable?: boolean;
  startEditing?: boolean;
  note?: string;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(sql);
  const [copied, setCopied] = useState(false);
  const [lastSql, setLastSql] = useState(sql);
  if (sql !== lastSql) {
    // A new answer arrived: show it instead of the old draft.
    setLastSql(sql);
    setDraft(sql);
  }
  return (
    <section className="rounded-lg border bg-muted/40" aria-labelledby="sql-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <h3 id="sql-heading" className="flex items-center gap-1.5 text-sm font-medium">
          <ShieldCheck className="size-4 text-brand-clay" aria-hidden /> SQL
          <span className="font-normal text-muted-foreground">· read-only, checked before it runs</span>
        </h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(editing ? draft : sql);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            aria-label="Copy SQL"
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          </Button>
          {editable && onRun && !editing ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden /> Edit
            </Button>
          ) : null}
        </div>
      </div>
      {editing && onRun ? (
        <form
          className="space-y-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            onRun(draft);
          }}
        >
          <Label htmlFor="sql-editor" className="sr-only">
            SQL query
          </Label>
          <Textarea
            id="sql-editor"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(16, Math.max(5, draft.split("\n").length + 1))}
            maxLength={4000}
            spellCheck={false}
            className="font-mono text-xs leading-relaxed"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onRun(draft);
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Ctrl/⌘ + Enter to run. Only SELECT queries on the demo tables are allowed.</p>
            <div className="flex gap-2">
              {sql ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(sql);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
              <Button type="submit" size="sm" disabled={running || !draft.trim()} aria-busy={running}>
                {running ? <Spinner label="Running" /> : <Play className="size-4" aria-hidden />} Run
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <pre className="max-h-80 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          <code>{sql || "-- no SQL"}</code>
        </pre>
      )}
      {note ? <p className="border-t px-3 py-2 text-xs text-muted-foreground">{note}</p> : null}
    </section>
  );
}
