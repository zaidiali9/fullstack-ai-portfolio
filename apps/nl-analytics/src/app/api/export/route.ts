import { z } from "zod";
import { assertSameOrigin, route } from "@portfolio/kit";
import { requireAppUserApi } from "@/server/access";
import { enforceQueryRate } from "@/server/ai/features";
import { csvResponse } from "@/server/csv";
import { runReadOnly } from "@/server/sql/execute";

const input = z.object({ sql: z.string().min(1).max(4000), title: z.string().max(100).default("query") });

/** POST { sql, title } -> CSV of the current (ad-hoc) result. Same guard and limits as any query. */
export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireAppUserApi();
  const { sql, title } = input.parse(await req.json().catch(() => ({})));
  await enforceQueryRate(user.id);
  return csvResponse(await runReadOnly(sql, { userId: user.id, source: "export" }), title);
});
