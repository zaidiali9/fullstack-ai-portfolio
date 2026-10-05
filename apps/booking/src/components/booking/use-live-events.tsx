"use client";
import { useEffect, useRef, useState } from "react";

export type LiveStatus = "connecting" | "live" | "offline";

/**
 * Subscribe to a Server-Sent Events endpoint. The browser reconnects automatically (the server
 * sends `retry: 5000`); `status` drives the small "Live" indicator.
 */
export function useLiveEvents<T>(url: string | null, onEvent: (data: T) => void): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  useEffect(() => {
    if (!url || typeof EventSource === "undefined") return;
    const es = new EventSource(url);
    const onReady = () => setStatus("live");
    const onBooking = (e: MessageEvent<string>) => {
      try {
        handler.current(JSON.parse(e.data) as T);
      } catch {
        /* ignore malformed events */
      }
    };
    es.addEventListener("ready", onReady);
    es.addEventListener("booking", onBooking as EventListener);
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? "offline" : "connecting");
    return () => {
      es.removeEventListener("ready", onReady);
      es.removeEventListener("booking", onBooking as EventListener);
      es.close();
    };
  }, [url]);
  return status;
}

export function LiveBadge({ status }: { status: LiveStatus }) {
  const label = status === "live" ? "Live" : status === "connecting" ? "Connecting…" : "Offline";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
      <span className={`size-2 rounded-full ${status === "live" ? "bg-emerald-500" : status === "connecting" ? "bg-amber-500" : "bg-muted-foreground"}`} aria-hidden />
      {label}
      <span className="sr-only"> availability updates</span>
    </span>
  );
}
