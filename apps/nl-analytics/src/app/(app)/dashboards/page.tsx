import { Globe, LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@portfolio/ui/empty-state";
import { PageHeader } from "@portfolio/ui/page-header";
import { CreateDashboardForm } from "@/components/dashboards/create-form";
import { TimeAgo } from "@/components/time-ago";
import { requireAppUser } from "@/server/access";
import { listDashboards } from "@/server/queries";

export const metadata: Metadata = { title: "Dashboards", robots: { index: false } };

export default async function DashboardsPage({ searchParams }: PageProps<"/dashboards">) {
  const [user, sp] = await Promise.all([requireAppUser(), searchParams]);
  const dashboards = await listDashboards(user);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Dashboards" description="Group saved queries into a page you can share as a read-only link." className="pb-0" />
      {sp.deleted ? (
        <p className="rounded-lg border bg-muted/50 p-3 text-sm" role="status">
          Dashboard deleted.
        </p>
      ) : null}
      <CreateDashboardForm />
      {dashboards.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {dashboards.map((d) => (
            <li key={d.id}>
              <Link href={`/dashboards/${d.id}`} className="block h-full rounded-xl border bg-card p-4 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <p className="flex items-center gap-2 font-medium">
                  {d.title}
                  {d.shared ? <Globe className="size-4 text-brand-clay" aria-label="Shared publicly" /> : null}
                </p>
                {d.description ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{d.description}</p> : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {d.tiles} tile{d.tiles === 1 ? "" : "s"} · updated <TimeAgo date={d.updatedAt} />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={LayoutDashboard} title="No dashboards yet" description="Create one above, then add saved queries to it from the query page." />
      )}
    </div>
  );
}
