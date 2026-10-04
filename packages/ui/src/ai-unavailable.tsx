import { SparklesIcon } from "lucide-react";
import { cn } from "./utils";

/** Honest label shown wherever an AI feature can't run (no provider configured, quota, failure). */
export function AiUnavailable({ reason = "AI unavailable", className }: { reason?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground", className)}>
      <SparklesIcon className="size-3" aria-hidden />
      {reason}
    </span>
  );
}
