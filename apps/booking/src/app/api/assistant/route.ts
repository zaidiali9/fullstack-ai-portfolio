import { assertSameOrigin, clientIp, route } from "@portfolio/kit";
import { currentUser } from "@/server/access";
import { searchFromRequest } from "@/server/ai/features";

/** POST { request } -> interpreted filters + real open times. Rate limited per user (or IP when signed out). */
export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const user = await currentUser();
  const body = await req.json().catch(() => ({}));
  const result = await searchFromRequest(user ? `user:${user.id}` : `ip:${clientIp(req.headers)}`, body, user?.id);
  return Response.json(result);
});
