import { ChevronLeft, LayoutDashboard, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@portfolio/ui/button";
import { EmptyState } from "@portfolio/ui/empty-state";
import { ActionButton } from "@/components/confirm-action-button";
import { ShareControls } from "@/components/dashboards/share-controls";
import { DashboardTile } from "@/components/dashboards/tile";
import { env } from "@/lib/env";
import { deleteDashboardAction } from "@/server/actions/queries";
import { requireAppUser } from "@/server/access";
import { getDashboard, runTiles } from "@/server/queries";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default async function DashboardPage({ params }: PageProps<"/dashboards/[id]">) {
  const { id } = await params;
  const user = await requireAppUser();
  const d = await getDashboard(user, id).catch(() => null);
  if (!d) notFound();
  const tiles = await runTiles(d.tiles, { userId: user.id, source: "dashboard" });
  return (
    <div className="space-y-6">
      <Link href="/dashboards" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> Dashboards
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{d.title}</h1>
          {d.description ? <p className="mt-1 text-sm text-muted-foreground">{d.description}</p> : null}
        </div>
        <ActionButton variant="ghost" size="sm" action={deleteDashboardAction.bind(null, d.id)} confirm="Delete this dashboard? Saved queries are kept.">
          <Trash2 className="size-4" aria-hidden /> Delete
        </ActionButton>
      </div>
      <ShareControls dashboardId={d.id} url={d.shareToken ? `${env().APP_URL}/shared/${d.shareToken}` : null} />
      {tiles.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {tiles.map((t, i) => (
            <DashboardTile key={t.queryId} {...t} csvHref={`/api/queries/${t.queryId}/csv`} edit={{ dashboardId: d.id, first: i === 0, last: i === tiles.length - 1 }} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={LayoutDashboard}
          title="No tiles yet"
          description="Open a saved query and choose “Add to dashboard”."
          action={
            <Link href="/queries" className={buttonVariants()}>
              Saved queries
            </Link>
          }
        />
      )}
    </div>
  );
}
