import "server-only";
import { sql } from "drizzle-orm";
import { dbHandle, type DB, type Tx } from "@/db";
import type { DateStr } from "./scheduling/time";

const CHANNEL = "bookwell_events";

export type BookingAction = "held" | "released" | "confirmed" | "cancelled" | "rescheduled" | "completed" | "no_show";

export interface BookingEvent {
  type: "booking";
  action: BookingAction;
  bookingId: string;
  reference: string;
  staffId: string;
  /** Local dates whose availability changed (old and new day for a reschedule). */
  dates: DateStr[];
  at: string;
}

/**
 * Publish through Postgres NOTIFY. Inside a transaction the notification is delivered only on
 * commit, so listeners never see changes that were rolled back. Works across server instances
 * with real Postgres; with PGlite it stays in-process.
 */
export async function publish(exec: DB | Tx, ev: Omit<BookingEvent, "type" | "at">) {
  const payload: BookingEvent = { type: "booking", at: new Date().toISOString(), ...ev };
  await exec.execute(sql`select pg_notify(${CHANNEL}, ${JSON.stringify(payload)})`);
}

type Listener = (ev: BookingEvent) => void;

interface Hub {
  listeners: Set<Listener>;
  ready: Promise<void> | null;
}

const g = globalThis as typeof globalThis & { __bookwellHub?: Hub };
const hub: Hub = (g.__bookwellHub ??= { listeners: new Set(), ready: null });

function ensureListening() {
  hub.ready ??= dbHandle()
    .listen(CHANNEL, (raw) => {
      let ev: BookingEvent;
      try {
        ev = JSON.parse(raw) as BookingEvent;
      } catch {
        return;
      }
      for (const l of hub.listeners) {
        try {
          l(ev);
        } catch (err) {
          console.warn("[realtime] listener failed", err);
        }
      }
    })
    .then(() => undefined)
    .catch((err) => {
      hub.ready = null; // retry on the next subscriber
      console.error("[realtime] LISTEN failed", err);
    });
  return hub.ready;
}

/** One database LISTEN per process, fanned out to every open SSE stream. */
export async function subscribe(listener: Listener): Promise<() => void> {
  await ensureListening();
  hub.listeners.add(listener);
  return () => hub.listeners.delete(listener);
}

export const listenerCount = () => hub.listeners.size;

/**
 * Server-Sent Events response. `map` decides what each subscriber may see (return null to skip);
 * a heartbeat comment every 20 s keeps proxies from closing idle connections.
 */
export function sseResponse(req: Request, map: (ev: BookingEvent) => object | null) {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup?.();
        }
      };
      const unsubscribe = await subscribe((ev) => {
        const data = map(ev);
        if (data) send(`event: booking\ndata: ${JSON.stringify(data)}\n\n`);
      });
      const heartbeat = setInterval(() => send(`: ping\n\n`), 20_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        cleanup = undefined;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", () => cleanup?.());
      send(`retry: 5000\nevent: ready\ndata: {}\n\n`);
    },
    cancel() {
      cleanup?.();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
