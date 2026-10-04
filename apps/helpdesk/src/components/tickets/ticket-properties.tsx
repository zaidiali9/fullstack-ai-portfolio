"use client";
import { useActionState, useRef } from "react";
import { Label } from "@portfolio/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { useFormToast } from "@/components/use-form-toast";
import { idle } from "@/lib/form-state";
import { updateTicketAction } from "@/server/actions/tickets";
import type { Ticket } from "@db/schema";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Status / priority / category / assignee editor. Changing a field saves immediately (JS) or via the button (no JS). */
export function TicketProperties({
  orgSlug,
  ticket,
  assignees,
}: {
  orgSlug: string;
  ticket: Pick<Ticket, "number" | "status" | "priority" | "category" | "assigneeId">;
  assignees: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(updateTicketAction.bind(null, orgSlug, ticket.number), idle);
  const formRef = useRef<HTMLFormElement>(null);
  useFormToast(state);
  const submit = () => formRef.current?.requestSubmit();
  const fields = [
    {
      name: "status",
      label: "Status",
      value: ticket.status,
      options: [
        ["open", "Open"],
        ["pending", "Pending (waiting on customer)"],
        ["resolved", "Resolved"],
        ["closed", "Closed"],
      ],
    },
    {
      name: "priority",
      label: "Priority",
      value: ticket.priority,
      options: [
        ["urgent", "Urgent"],
        ["high", "High"],
        ["medium", "Medium"],
        ["low", "Low"],
      ],
    },
    {
      name: "category",
      label: "Category",
      value: ticket.category ?? "",
      options: [
        ["", "Uncategorized"],
        ["billing", "Billing"],
        ["technical", "Technical"],
        ["account", "Account"],
        ["other", "Other"],
      ],
    },
    { name: "assigneeId", label: "Assignee", value: ticket.assigneeId ?? "none", options: [["none", "Unassigned"], ...assignees.map((a) => [a.id, a.name])] },
  ];
  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-xl border bg-card p-4" aria-label="Ticket properties">
      <h2 className="text-sm font-semibold">Properties</h2>
      {fields.map((f) => (
        <div key={f.name} className="space-y-1">
          <Label htmlFor={f.name} className="text-xs text-muted-foreground">
            {f.label}
          </Label>
          <select id={f.name} name={f.name} defaultValue={f.value} className={selectClass} onChange={submit}>
            {f.options.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      ))}
      <noscript>
        <SubmitButton size="sm">Save</SubmitButton>
      </noscript>
    </form>
  );
}
