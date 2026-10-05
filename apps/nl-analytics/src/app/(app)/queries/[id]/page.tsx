import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HttpError } from "@portfolio/kit";
import { SavedQueryView } from "@/components/queries/saved-query-view";
import { requireAppUser } from "@/server/access";
import { dashboardsContaining, getQuery } from "@/server/queries";
import { runReadOnly } from "@/server/sql/execute";

export const metadata: Metadata = { title: "Saved query", robots: { index: false } };

export default async function SavedQueryPage({ params }: PageProps<"/queries/[id]">) {
  const { id } = await params;
  const user = await requireAppUser();
  const query = await getQuery(user, id).catch(() => null);
  if (!query) notFound();
  const [run, { dashboards, containing }] = await Promise.all([
    runReadOnly(query.sql, { userId: user.id, source: "saved", question: query.question }).then(
      (result) => ({ result, error: null }),
      (err: unknown) => ({ result: null, error: err instanceof HttpError ? err.message : "This query couldn't be run." }),
    ),
    dashboardsContaining(user, query.id),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/queries" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> Saved queries
      </Link>
      <SavedQueryView
        query={{ id: query.id, title: query.title, question: query.question, sql: query.sql, chart: query.chart, source: query.source }}
        result={run.result}
        error={run.error}
        dashboards={dashboards.map((d) => ({ id: d.id, title: d.title, contains: containing.has(d.id) }))}
      />
    </div>
  );
}
