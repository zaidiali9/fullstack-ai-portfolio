import { assertSameOrigin, route } from "@portfolio/kit";
import { requireAppUserApi } from "@/server/access";
import { askQuestion } from "@/server/ai/features";

/** POST { question } -> generated SQL (always returned), guarded result and chart, or a readable failure. */
export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireAppUserApi();
  return Response.json(await askQuestion(user, await req.json().catch(() => ({}))));
});
