import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { clientIp, HttpError } from "@portfolio/kit";
import { headers } from "next/headers";
import { AppHeader } from "@/components/app/header";
import { DashboardTile } from "@/components/dashboards/tile";
import { enforceQueryRate } from "@/server/ai/features";
import { getSharedDashboard, runTiles } from "@/server/queries";
import { currentUser } from "@/server/access";

async function load(token: string) {
  return getSharedDashboard(token).catch(() => null);
}

export async function generateMetadata({ params }: PageProps<"/shared/[token]">): Promise<Metadata> {
  const d = await load((await params).token);
  return d
    ? { title: d.title, description: d.description || "A read-only dashboard shared from Tally.", alternates: { canonical: `/shared/${(await params).token}` }, robots: { index: false } }
    : { title: "Dashboard not found", robots: { index: false } };
}

/** Public, read-only. Each tile re-runs its saved SQL through the same guard; no editing controls. */
export default async function SharedDashboardPage({ params }: PageProps<"/shared/[token]">) {
  const { token } = await params;
  const d = await load(token);
  if (!d) notFound();
  const [user, h] = await Promise.all([currentUser(), headers()]);
  let tiles: Awaited<ReturnType<typeof runTiles>> = [];
  let limited = false;
  try {
    await enforceQueryRate(`ip:${clientIp(h)}`);
    tiles = await runTiles(d.tiles, { userId: null, source: "shared" });
  } catch (err) {
    if (!(err instanceof HttpError && err.status === 429)) throw err;
    limited = true;
  }
  return (
    <>
      <AppHeader user={user ? { name: user.name, role: user.role } : null} />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-8">
        <div>
          <p className="text-xs font-medium tracking-wide text-brand-clay uppercase">Shared dashboard · read-only</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">{d.title}</h1>
          {d.description ? <p className="mt-1 text-sm text-muted-foreground">{d.description}</p> : null}
        </div>
        {limited ? <p className="rounded-lg border p-4 text-sm">This dashboard is being viewed a lot right now. Please try again in a minute.</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {tiles.map((t) => (
            <DashboardTile key={t.queryId} {...t} csvHref={`/api/shared/${token}/csv?query=${t.queryId}`} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Data: Lanternfish Supply Co., a fictional retailer (seed data). Figures update each time the page loads.</p>
      </main>
    </>
  );
}
