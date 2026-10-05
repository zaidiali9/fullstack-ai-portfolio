import { assertSameOrigin, route } from "@portfolio/kit";
import { requireAppUserApi } from "@/server/access";
import { runManual } from "@/server/ai/features";

/** POST { sql, question?, chart? } -> run hand-written/edited SQL through the same guard as model SQL. */
export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireAppUserApi();
  return Response.json(await runManual(user, await req.json().catch(() => ({}))));
});
