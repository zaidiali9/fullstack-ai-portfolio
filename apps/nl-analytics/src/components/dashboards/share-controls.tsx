"use client";
import { Check, Copy, Globe, Lock } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@portfolio/ui/button";
import { Input } from "@portfolio/ui/input";
import { Spinner } from "@portfolio/ui/spinner";
import { shareAction } from "@/server/actions/queries";

/** Turn the public read-only link on/off. Turning it off (or on again) invalidates the old link. */
export function ShareControls({ dashboardId, url }: { dashboardId: string; url: string | null }) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const toggle = (enabled: boolean) =>
    start(async () => {
      const r = await shareAction(dashboardId, enabled);
      if (r.status === "error") toast.error(r.message ?? "Couldn't change sharing.");
      else if (r.message) toast.success(r.message);
    });
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          {url ? <Globe className="size-4 text-brand-clay" aria-hidden /> : <Lock className="size-4 text-muted-foreground" aria-hidden />}
          {url ? "Anyone with the link can view (read-only)" : "Private — only you can see this dashboard"}
        </p>
        <Button variant={url ? "outline" : "default"} size="sm" disabled={pending} aria-busy={pending} onClick={() => toggle(!url)}>
          {pending ? <Spinner label="Updating" /> : null}
          {url ? "Stop sharing" : "Create public link"}
        </Button>
      </div>
      {url ? (
        <div className="mt-3 flex gap-2">
          <label htmlFor="share-url" className="sr-only">
            Public link
          </label>
          <Input id="share-url" readOnly value={url} className="h-9 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            aria-label="Copy link"
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
