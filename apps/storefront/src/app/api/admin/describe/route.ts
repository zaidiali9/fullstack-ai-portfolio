import { z } from "zod";
import { assertSameOrigin, route } from "@portfolio/kit";
import { categories } from "@db/schema";
import { requireAdminApi } from "@/server/access";
import { draftDescription, parseAttributes } from "@/server/products-admin";

const input = z.object({
  name: z.string().trim().min(3).max(120),
  category: z.enum(categories),
  attributes: z.string().max(2000).default(""),
  notes: z.string().trim().max(500).optional(),
});

/** POST: AI description draft for the admin editor (admins only, rate limited, validated output). */
export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireAdminApi();
  const body = input.parse(await req.json().catch(() => ({})));
  const result = await draftDescription(user, { name: body.name, category: body.category, attributes: parseAttributes(body.attributes), notes: body.notes });
  return Response.json(result);
});
