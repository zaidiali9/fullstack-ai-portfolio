import { streamResponse } from "@portfolio/ai";
import { assertSameOrigin, enforceRateLimit, errorResponse, route } from "@portfolio/kit";
import { db } from "@/db";
import { env } from "@/lib/env";
import { requireWsApi } from "@/server/authz";
import { ask, askInput } from "@/server/chat";

/** POST { question, conversationId? } -> streamed answer. Headers carry the conversation id and sources. */
export const POST = route(async (req: Request, { params }: RouteContext<"/api/w/[ws]/chat">) => {
  assertSameOrigin(req);
  const { ws } = await params;
  const ctx = await requireWsApi(ws, "chat:ask");
  await enforceRateLimit(db, `chat:${ctx.user.id}`, { limit: env().AI_USER_PER_MINUTE, windowMs: 60_000, message: "You're asking too quickly. Please wait a minute." });
  const input = askInput.parse(await req.json().catch(() => ({})));
  const result = await ask({ ws: ctx.ws, userId: ctx.user.id, source: "app" }, input);
  return streamResponse(result.stream, {
    onEarlyError: errorResponse,
    trailer: (meta) => meta,
    headers: {
      "x-conversation-id": result.conversationId,
      "x-sources": encodeURIComponent(JSON.stringify(result.sources)),
    },
  });
});
