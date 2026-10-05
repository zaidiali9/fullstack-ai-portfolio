import { route } from "@portfolio/kit";
import { requireAppUserApi } from "@/server/access";
import { enforceQueryRate } from "@/server/ai/features";
import { csvResponse } from "@/server/csv";
import { runSaved } from "@/server/queries";

/** GET -> CSV of a saved query (owner only; 404 otherwise). */
export const GET = route(async (_req: Request, { params }: RouteContext<"/api/queries/[id]/csv">) => {
  const user = await requireAppUserApi();
  await enforceQueryRate(user.id);
  const { query, result } = await runSaved(user, (await params).id, "export");
  return csvResponse(result, query.title);
});
