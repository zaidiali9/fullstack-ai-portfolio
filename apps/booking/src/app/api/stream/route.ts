import { listenerCount, sseResponse } from "@/server/realtime";

export const dynamic = "force-dynamic";

const MAX_STREAMS = 1000;

/** Public live-availability stream: only which dates/staff changed — never who booked or why. */
export function GET(req: Request) {
  if (listenerCount() >= MAX_STREAMS) return Response.json({ error: { code: "busy", message: "Live updates are busy; availability still refreshes when you reload." } }, { status: 503 });
  return sseResponse(req, (ev) => ({ dates: ev.dates, staffId: ev.staffId }));
}
