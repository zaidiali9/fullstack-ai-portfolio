import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@portfolio/ui/badge";
import { buttonVariants } from "@portfolio/ui/button";
import { ActionButton } from "@/components/confirm-action-button";
import { Markdown } from "@/components/kb/markdown";
import { TimeAgo } from "@/components/time-ago";
import { deleteArticleAction } from "@/server/actions/kb";
import { requireOrgPage } from "@/server/authz";
import { getArticle } from "@/server/kb";
import { can } from "@/server/permissions";

export const metadata: Metadata = { title: "Article" };

export default async function ArticlePage({ params }: PageProps<"/o/[org]/kb/[id]">) {
  const { org, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireOrgPage(org, "kb:read");
  const article = await getArticle(ctx, id).catch(() => notFound());
  const canWrite = can(ctx.role, "kb:write");
  return (
    <article className="max-w-3xl">
      <Link href={`/o/${org}/kb`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All articles
      </Link>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{article.title}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            Updated <TimeAgo date={article.updatedAt} />
            {!article.published ? <Badge variant="outline">Draft</Badge> : null}
          </p>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <Link href={`/o/${org}/kb/${id}/edit`} className={buttonVariants({ variant: "outline" })}>
              <Pencil className="size-4" aria-hidden /> Edit
            </Link>
            <ActionButton variant="destructive" confirm="Delete this article? This cannot be undone." action={deleteArticleAction.bind(null, org, id)}>
              <Trash2 className="size-4" aria-hidden /> Delete
            </ActionButton>
          </div>
        ) : null}
      </header>
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <Markdown>{article.body}</Markdown>
      </div>
    </article>
  );
}
