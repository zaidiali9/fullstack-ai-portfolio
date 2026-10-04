import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./utils";

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center", className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
