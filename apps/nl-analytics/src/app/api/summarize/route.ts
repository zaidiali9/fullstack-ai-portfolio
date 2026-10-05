import { streamResponse } from "@portfolio/ai";
import { assertSameOrigin, errorResponse, route } from "@portfolio/kit";
import { requireAppUserApi } from "@/server/access";
import { streamSummary } from "@/server/ai/features";

/** POST { question, sql } -> streamed summary; trailer lists numbers not found in the result rows. */
export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireAppUserApi();
  const stream = await streamSummary(user, await req.json().catch(() => ({})));
  return streamResponse(stream, { onEarlyError: errorResponse, trailer: (meta) => meta });
});
