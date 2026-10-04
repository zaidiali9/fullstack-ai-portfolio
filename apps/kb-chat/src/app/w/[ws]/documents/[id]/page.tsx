import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@portfolio/ui/badge";
import { TimeAgo } from "@/components/time-ago";
import { requireWsPage } from "@/server/authz";
import { getDocument } from "@/server/documents";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: PageProps<"/w/[ws]/documents/[id]">) {
  const { ws, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireWsPage(ws, "docs:read");
  const { doc, preview } = await getDocument(ctx, id).catch(() => notFound());
  return (
    <div className="max-w-3xl">
      <Link href={`/w/${ws}/documents`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All documents
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight break-words">{doc.title}</h1>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <Badge variant={doc.status === "failed" ? "destructive" : "secondary"}>{doc.status}</Badge>
        </dd>
        <dt className="text-muted-foreground">Source</dt>
        <dd className="break-all">{doc.sourceUrl ?? doc.fileName}</dd>
        <dt className="text-muted-foreground">Indexed passages</dt>
        <dd>
          {doc.chunkCount}
          {doc.pageCount ? ` from ${doc.pageCount} pages` : ""}
        </dd>
        <dt className="text-muted-foreground">Added</dt>
        <dd>
          <TimeAgo date={doc.createdAt} />
        </dd>
      </dl>
      {doc.error ? <p className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{doc.error}</p> : null}
      <h2 className="mt-8 mb-3 font-semibold">Passages {preview.length < doc.chunkCount ? `(first ${preview.length})` : ""}</h2>
      <ol className="space-y-3">
        {preview.map((c) => (
          <li key={c.id} className="rounded-xl border bg-card p-4 text-sm">
            <p className="mb-1 text-xs text-muted-foreground">
              #{c.ordinal + 1}
              {c.page ? ` · page ${c.page}` : ""}
            </p>
            <p className="leading-relaxed whitespace-pre-wrap">{c.content}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
