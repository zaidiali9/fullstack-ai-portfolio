import { BookOpenText, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AiUnavailable } from "@portfolio/ui/ai-unavailable";
import { Badge } from "@portfolio/ui/badge";
import { Button, buttonVariants } from "@portfolio/ui/button";
import { EmptyState } from "@portfolio/ui/empty-state";
import { Input } from "@portfolio/ui/input";
import { PageHeader } from "@portfolio/ui/page-header";
import { PaginationNav } from "@portfolio/ui/pagination-nav";
import { ActionButton } from "@/components/confirm-action-button";
import { TimeAgo } from "@/components/time-ago";
import { aiStatus } from "@/lib/ai";
import { reembedAction } from "@/server/actions/kb";
import { requireOrgPage } from "@/server/authz";
import { listArticles } from "@/server/kb";
import { can } from "@/server/permissions";

export const metadata: Metadata = { title: "Knowledge base" };

export default async function KbPage({ params, searchParams }: PageProps<"/o/[org]/kb">) {
  const { org } = await params;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const pageNum = Math.max(1, Number(sp.page) || 1);
  const ctx = await requireOrgPage(org, "kb:read");
  const canWrite = can(ctx.role, "kb:write");
  const page = await listArticles(ctx, { q, page: pageNum, pageSize: 20 });
  const embeddingsOn = !!aiStatus().embeddings;
  const base = `/o/${org}/kb`;
  return (
    <>
      <PageHeader
        title={canWrite ? "Knowledge base" : "Help articles"}
        description={canWrite ? "Articles customers can read. Published articles also ground AI reply drafts." : "Answers to common questions."}
        actions={
          canWrite ? (
            <>
              {embeddingsOn ? (
                <ActionButton variant="outline" action={reembedAction.bind(null, org)}>
                  Embed pending
                </ActionButton>
              ) : (
                <AiUnavailable reason="Embeddings unavailable: keyword search only" />
              )}
              <Link href={`${base}/new`} className={buttonVariants({ className: "h-9 px-3" })}>
                <Plus className="size-4" aria-hidden /> New article
              </Link>
            </>
          ) : null
        }
      />
      <form method="get" action={base} role="search" className="mb-4 flex max-w-md gap-2">
        <label htmlFor="kb-q" className="sr-only">
          Search articles
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="kb-q" name="q" defaultValue={q} placeholder="Search articles" className="pl-8" />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {page.items.length === 0 ? (
        <EmptyState
          icon={BookOpenText}
          title={q ? "No articles match your search" : "No articles yet"}
          description={canWrite ? "Write your first article: refund policy, how to reset a password, shipping times…" : "Check back later, or open a ticket."}
          action={
            canWrite ? (
              <Link href={`${base}/new`} className={buttonVariants()}>
                <Plus className="size-4" aria-hidden /> New article
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="space-y-4">
          <ul className="grid gap-3 md:grid-cols-2">
            {page.items.map((a) => (
              <li key={a.id}>
                <Link href={`${base}/${a.id}`} className="block h-full rounded-xl border bg-card p-4 transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-medium">{a.title}</h2>
                    {!a.published ? <Badge variant="outline">Draft</Badge> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.excerpt.replace(/[#*_`>]/g, "")}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Updated <TimeAgo date={a.updatedAt} />
                    {canWrite ? (a.embedded ? " · embedded" : " · not embedded yet") : null}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <PaginationNav page={page.page} totalPages={page.totalPages} total={page.total} label="articles" hrefFor={(p) => `${base}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`} />
        </div>
      )}
    </>
  );
}
