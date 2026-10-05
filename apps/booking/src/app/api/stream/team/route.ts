import { route } from "@portfolio/kit";
import { requireTeamApi } from "@/server/access";
import { sseResponse } from "@/server/realtime";

export const dynamic = "force-dynamic";

/** Team stream: booking references and actions for the live calendar (owner/staff only). */
export const GET = route(async (req: Request) => {
  await requireTeamApi();
  return sseResponse(req, (ev) => ({ action: ev.action, reference: ev.reference, bookingId: ev.bookingId, staffId: ev.staffId, dates: ev.dates }));
});
