import { streamResponse } from "@portfolio/ai";
import { assertSameOrigin, clientIp, enforceRateLimit, errorResponse, notFound, route } from "@portfolio/kit";
import { db } from "@/db";
import { env } from "@/lib/env";
import { ask, askInput } from "@/server/chat";
import { getWidgetWorkspace } from "@/server/workspaces";

/**
 * Anonymous widget chat. Called only from the /embed iframe (same origin as this API), rate limited
 * per IP and per widget, and counted against the workspace's monthly question limit.
 */
export const POST = route(async (req: Request, { params }: RouteContext<"/api/embed/[key]/chat">) => {
  assertSameOrigin(req);
  const { key } = await params;
  const ws = await getWidgetWorkspace(key);
  if (!ws) throw notFound("Widget");
  await enforceRateLimit(db, `widget:${key}:${clientIp(req.headers)}`, { limit: env().WIDGET_PER_MINUTE, windowMs: 60_000, message: "Please wait a moment before asking again." });
  await enforceRateLimit(db, `widget:${key}`, { limit: 60, windowMs: 60_000, message: "This assistant is busy. Please try again shortly." });
  const input = askInput.parse(await req.json().catch(() => ({})));
  const result = await ask({ ws, userId: null, source: "widget" }, input);
  return streamResponse(result.stream, {
    onEarlyError: errorResponse,
    trailer: (meta) => meta,
    headers: { "x-conversation-id": result.conversationId, "x-sources": encodeURIComponent(JSON.stringify(result.sources)) },
  });
});
