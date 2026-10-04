import { z } from "zod";
import { route } from "@portfolio/kit";
import { requireWsApi } from "@/server/authz";
import { getChunk } from "@/server/documents";

/** GET: full text of one cited chunk (workspace-scoped), for the citation viewer. */
export const GET = route(async (_req: Request, { params }: RouteContext<"/api/w/[ws]/chunks/[id]">) => {
  const { ws, id } = await params;
  const ctx = await requireWsApi(ws, "docs:read");
  return Response.json(await getChunk(ctx, z.uuid().parse(id)), { headers: { "cache-control": "private, max-age=60" } });
});
