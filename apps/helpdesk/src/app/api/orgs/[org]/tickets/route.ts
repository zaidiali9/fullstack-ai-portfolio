import { route } from "@portfolio/kit";
import { requireOrgApi } from "@/server/authz";
import { listFilters, listTickets } from "@/server/tickets";

/** GET /api/orgs/:org/tickets?status=&priority=&category=&assignee=&q=&page=&pageSize= */
export const GET = route(async (req: Request, { params }: RouteContext<"/api/orgs/[org]/tickets">) => {
  const { org } = await params;
  const ctx = await requireOrgApi(org);
  const filters = listFilters.parse(Object.fromEntries(new URL(req.url).searchParams));
  return Response.json(await listTickets(ctx, filters), { headers: { "cache-control": "private, no-store" } });
});
