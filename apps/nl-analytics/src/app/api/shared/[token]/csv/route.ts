import { clientIp, notFound, route } from "@portfolio/kit";
import { enforceQueryRate } from "@/server/ai/features";
import { csvResponse } from "@/server/csv";
import { getSharedDashboard } from "@/server/queries";
import { runReadOnly } from "@/server/sql/execute";

/** GET ?query=<id> -> CSV of one tile of a shared dashboard (public, rate limited per IP). */
export const GET = route(async (req: Request, { params }: RouteContext<"/api/shared/[token]/csv">) => {
  await enforceQueryRate(`ip:${clientIp(req.headers)}`);
  const d = await getSharedDashboard((await params).token);
  const tile = d.tiles.find((t) => t.queryId === new URL(req.url).searchParams.get("query"));
  if (!tile) throw notFound("Tile");
  return csvResponse(await runReadOnly(tile.sql, { userId: null, source: "shared" }), tile.title);
});
