"use client";
import { AlertCircle, CheckCircle2, FileText, Globe, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@portfolio/ui/badge";
import { Spinner } from "@portfolio/ui/spinner";
import { ActionButton } from "@/components/confirm-action-button";
import { deleteDocumentAction, retryDocumentAction } from "@/server/actions/workspace";

export interface DocRow {
  id: string;
  title: string;
  sourceType: "file" | "url";
  fileName: string | null;
  sourceUrl: string | null;
  sizeBytes: number;
  status: "queued" | "processing" | "ready" | "failed";
  error: string | null;
  pageCount: number | null;
  chunkCount: number;
  createdAt: string | Date;
}

const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Status({ d }: { d: DocRow }) {
  if (d.status === "ready")
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2 className="size-3" aria-hidden /> Ready
      </Badge>
    );
  if (d.status === "failed")
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="size-3" aria-hidden /> Failed
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1.5">
      <Spinner className="size-3" label={d.status === "queued" ? "Queued" : "Indexing"} /> {d.status === "queued" ? "Queued" : "Indexing"}
    </Badge>
  );
}

/** Live list: polls the status endpoint every 2 s while anything is queued or processing. */
export function DocumentList({ slug, initial, canWrite }: { slug: string; initial: DocRow[]; canWrite: boolean }) {
  const [docs, setDocs] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setDocs(initial);
  }
  const pending = docs.some((d) => d.status === "queued" || d.status === "processing");
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/w/${slug}/documents`);
      if (res.ok) setDocs(((await res.json()) as { documents: DocRow[] }).documents);
    }, 2000);
    return () => clearInterval(id);
  }, [pending, slug]);

  return (
    <ul className="divide-y rounded-xl border bg-card" aria-label="Documents">
      {docs.map((d) => (
        <li key={d.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {d.sourceType === "url" ? <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> : <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
            <div className="min-w-0">
              <Link href={`/w/${slug}/documents/${d.id}`} className="block truncate font-medium hover:underline">
                {d.title}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {d.sourceType === "url" ? d.sourceUrl : d.fileName} · {size(d.sizeBytes)}
                {d.status === "ready" ? ` · ${d.chunkCount} passages${d.pageCount ? ` · ${d.pageCount} pages` : ""}` : ""}
              </p>
              {d.error ? <p className="mt-1 text-xs text-destructive">{d.error}</p> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Status d={d} />
            {canWrite && d.status === "failed" ? (
              <ActionButton size="sm" variant="ghost" action={retryDocumentAction.bind(null, slug, d.id)} aria-label={`Retry ${d.title}`}>
                <RotateCcw className="size-3.5" aria-hidden />
              </ActionButton>
            ) : null}
            {canWrite ? (
              <ActionButton size="sm" variant="ghost" confirm={`Delete "${d.title}" and its index?`} action={deleteDocumentAction.bind(null, slug, d.id)} aria-label={`Delete ${d.title}`}>
                <Trash2 className="size-3.5" aria-hidden />
              </ActionButton>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
