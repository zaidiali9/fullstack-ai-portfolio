import { AlertTriangle, ArrowDown, ArrowUp, CircleDot, Frown, Meh, Minus, Smile } from "lucide-react";
import { Badge } from "@portfolio/ui/badge";
import type { Ticket } from "@db/schema";
import { cn } from "@/lib/utils";

const STATUS: Record<Ticket["status"], { label: string; className: string }> = {
  open: { label: "Open", className: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" },
  pending: { label: "Pending", className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  resolved: { label: "Resolved", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground" },
};

export function StatusBadge({ status }: { status: Ticket["status"] }) {
  const s = STATUS[status];
  return (
    <Badge variant="outline" className={cn("border-transparent", s.className)}>
      <CircleDot className="size-3" aria-hidden /> {s.label}
    </Badge>
  );
}

const PRIORITY: Record<Ticket["priority"], { label: string; icon: typeof ArrowUp; className: string }> = {
  urgent: { label: "Urgent", icon: AlertTriangle, className: "text-red-700 dark:text-red-300" },
  high: { label: "High", icon: ArrowUp, className: "text-orange-700 dark:text-orange-300" },
  medium: { label: "Medium", icon: Minus, className: "text-foreground" },
  low: { label: "Low", icon: ArrowDown, className: "text-muted-foreground" },
};

export function PriorityLabel({ priority }: { priority: Ticket["priority"] }) {
  const p = PRIORITY[priority];
  const Icon = p.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-medium", p.className)}>
      <Icon className="size-3.5" aria-hidden /> {p.label}
    </span>
  );
}

export const CATEGORY_LABEL: Record<NonNullable<Ticket["category"]>, string> = {
  billing: "Billing",
  technical: "Technical",
  account: "Account",
  other: "Other",
};

export function CategoryBadge({ category }: { category: Ticket["category"] }) {
  if (!category) return <span className="text-sm text-muted-foreground">—</span>;
  return <Badge variant="secondary">{CATEGORY_LABEL[category]}</Badge>;
}

export function SentimentIcon({ sentiment }: { sentiment: Ticket["sentiment"] }) {
  if (!sentiment) return null;
  const Icon = sentiment === "negative" ? Frown : sentiment === "positive" ? Smile : Meh;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", sentiment === "negative" ? "text-red-700 dark:text-red-300" : "text-muted-foreground")} title={`Sentiment: ${sentiment}`}>
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">Sentiment: {sentiment}</span>
    </span>
  );
}
