import { Sparkles } from "lucide-react";
import { AiUnavailable } from "@portfolio/ui/ai-unavailable";
import { ActionButton } from "@/components/confirm-action-button";
import { retriageAction } from "@/server/actions/tickets";
import type { Ticket } from "@db/schema";
import { CategoryBadge, PriorityLabel } from "./badges";

const STATUS_TEXT: Record<Ticket["triageStatus"], string> = {
  pending: "Triage is running…",
  done: "",
  unavailable: "AI unavailable when this ticket arrived (no provider configured or daily quota reached).",
  failed: "The model's answer didn't pass validation, so nothing was applied.",
  manual: "Category or priority was set by an agent.",
};

export function TriageCard({ orgSlug, ticket, aiAvailable }: { orgSlug: string; ticket: Ticket; aiAvailable: boolean }) {
  return (
    <section className="rounded-xl border bg-card p-4" aria-labelledby="triage-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="triage-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="size-4 text-brand-coral" aria-hidden /> AI triage
        </h2>
        {aiAvailable ? (
          <ActionButton size="sm" variant="ghost" action={retriageAction.bind(null, orgSlug, ticket.number)}>
            {ticket.triageStatus === "done" ? "Re-run" : "Run triage"}
          </ActionButton>
        ) : (
          <AiUnavailable />
        )}
      </div>
      {ticket.triageStatus === "done" ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Category</dt>
          <dd>
            <CategoryBadge category={ticket.category} />
          </dd>
          <dt className="text-muted-foreground">Priority</dt>
          <dd>
            <PriorityLabel priority={ticket.priority} />
          </dd>
          <dt className="text-muted-foreground">Sentiment</dt>
          <dd className="capitalize">{ticket.sentiment ?? "—"}</dd>
          {ticket.aiSummary ? (
            <>
              <dt className="text-muted-foreground">Summary</dt>
              <dd>{ticket.aiSummary}</dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{STATUS_TEXT[ticket.triageStatus]}</p>
      )}
    </section>
  );
}
