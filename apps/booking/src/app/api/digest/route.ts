import { streamResponse } from "@portfolio/ai";
import { assertSameOrigin, errorResponse, forbidden, route } from "@portfolio/kit";
import { requireTeamApi } from "@/server/access";
import { streamDigest } from "@/server/ai/features";

/** Owner only: streamed weekly digest narrative; the trailer lists numbers not found in the stats. */
export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireTeamApi();
  if (user.role !== "owner") throw forbidden("Only the owner can generate the weekly digest.");
  const { stream } = await streamDigest(user);
  return streamResponse(stream, { onEarlyError: errorResponse, trailer: (meta) => meta });
});
