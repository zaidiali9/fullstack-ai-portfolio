import { BookmarkPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@portfolio/ui/badge";
import { buttonVariants } from "@portfolio/ui/button";
import { EmptyState } from "@portfolio/ui/empty-state";
import { PageHeader } from "@portfolio/ui/page-header";
import { TimeAgo } from "@/components/time-ago";
import { requireAppUser } from "@/server/access";
import { listQueries } from "@/server/queries";

export const metadata: Metadata = { title: "Saved queries", robots: { index: false } };

export default async function QueriesPage({ searchParams }: PageProps<"/queries">) {
  const [user, sp] = await Promise.all([requireAppUser(), searchParams]);
  const queries = await listQueries(user);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Saved queries"
        description="Re-run on current data, edit the SQL, export CSV or pin them to dashboards."
        actions={
          <Link href="/ask" className={buttonVariants()}>
            New question
          </Link>
        }
      />
      {sp.deleted ? (
        <p className="mb-4 rounded-lg border bg-muted/50 p-3 text-sm" role="status">
          Query deleted.
        </p>
      ) : null}
      {queries.length ? (
        <ul className="divide-y rounded-xl border bg-card">
          {queries.map((q) => (
            <li key={q.id}>
              <Link href={`/queries/${q.id}`} className="flex items-start justify-between gap-4 p-4 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <div className="min-w-0">
                  <p className="truncate font-medium">{q.title}</p>
                  <p className="truncate text-sm text-muted-foreground">{q.question || q.sql.replace(/\s+/g, " ")}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant="secondary">{q.source === "ai" ? "AI SQL" : "Hand-written"}</Badge>
                  <span className="text-xs text-muted-foreground">
                    <TimeAgo date={q.updatedAt} />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={BookmarkPlus}
          title="No saved queries yet"
          description="Ask a question, then press Save to keep the query and re-run it any time."
          action={
            <Link href="/ask" className={buttonVariants()}>
              Ask a question
            </Link>
          }
        />
      )}
    </div>
  );
}
