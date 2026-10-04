"use client";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { Button, buttonVariants } from "@portfolio/ui/button";
import { Input } from "@portfolio/ui/input";

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * Filters are a plain GET form, so they work without JavaScript and every view is a shareable URL.
 * With JavaScript, changing a select submits immediately.
 */
export function TicketFilters({
  basePath,
  values,
  isStaff,
  assignees,
}: {
  basePath: string;
  values: Record<string, string | undefined>;
  isStaff: boolean;
  assignees: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();
  const active = Object.entries(values).some(([k, v]) => v && k !== "page" && !(k === "status" && v === "active"));
  return (
    <form ref={formRef} method="get" action={basePath} className="flex flex-wrap items-end gap-2" role="search" aria-label="Filter tickets">
      <div className="relative min-w-48 flex-1 sm:max-w-xs">
        <label htmlFor="q" className="sr-only">
          Search subject or ticket number
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input id="q" name="q" defaultValue={values.q} placeholder="Search subject or #number" className="pl-8" />
      </div>
      <label className="sr-only" htmlFor="status">
        Status
      </label>
      <select id="status" name="status" defaultValue={values.status ?? "active"} className={selectClass} onChange={submit}>
        <option value="active">Open + pending</option>
        <option value="open">Open</option>
        <option value="pending">Pending</option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
        <option value="all">All statuses</option>
      </select>
      {isStaff ? (
        <>
          <label className="sr-only" htmlFor="priority">
            Priority
          </label>
          <select id="priority" name="priority" defaultValue={values.priority ?? ""} className={selectClass} onChange={submit}>
            <option value="">Any priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <label className="sr-only" htmlFor="category">
            Category
          </label>
          <select id="category" name="category" defaultValue={values.category ?? ""} className={selectClass} onChange={submit}>
            <option value="">Any category</option>
            <option value="billing">Billing</option>
            <option value="technical">Technical</option>
            <option value="account">Account</option>
            <option value="other">Other</option>
          </select>
          <label className="sr-only" htmlFor="assignee">
            Assignee
          </label>
          <select id="assignee" name="assignee" defaultValue={values.assignee ?? ""} className={selectClass} onChange={submit}>
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </>
      ) : null}
      <Button type="submit" variant="secondary">
        Apply
      </Button>
      {active ? (
        <Link href={basePath} className={buttonVariants({ variant: "ghost" })}>
          <X className="size-4" aria-hidden /> Clear
        </Link>
      ) : null}
    </form>
  );
}
