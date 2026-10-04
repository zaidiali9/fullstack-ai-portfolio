import { z } from "zod";
import { streamResponse } from "@portfolio/ai";
import { assertSameOrigin, errorResponse, route } from "@portfolio/kit";
import { draftReply } from "@/server/ai/features";
import { enforceAiLimits } from "@/server/ai/quota";
import { requireOrgApi } from "@/server/authz";

/** POST: stream an AI reply draft grounded in the org's knowledge base (agents only). */
export const POST = route(async (req: Request, { params }: RouteContext<"/api/orgs/[org]/tickets/[number]/draft">) => {
  assertSameOrigin(req);
  const { org, number } = await params;
  const ctx = await requireOrgApi(org, "ai:use");
  await enforceAiLimits(ctx.user.id, ctx.org);
  const { stream, sources } = await draftReply(ctx, z.coerce.number().int().positive().parse(number));
  return streamResponse(stream, {
    onEarlyError: errorResponse,
    headers: { "x-ai-sources": encodeURIComponent(JSON.stringify(sources)) },
  });
});
