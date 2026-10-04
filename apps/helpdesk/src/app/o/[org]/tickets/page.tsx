import { Inbox, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { EmptyState } from "@portfolio/ui/empty-state";
import { PageHeader } from "@portfolio/ui/page-header";
import { PaginationNav } from "@portfolio/ui/pagination-nav";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { TicketList } from "@/components/tickets/ticket-list";
import { requireOrg } from "@/server/authz";
import { can } from "@/server/permissions";
import { listAssignableMembers, listFilters, listTickets, ticketCounts } from "@/server/tickets";

export const metadata: Metadata = { title: "Tickets" };

export default async function TicketsPage({ params, searchParams }: PageProps<"/o/[org]/tickets">) {
  const { org } = await params;
  const ctx = await requireOrg(org);
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const parsed = listFilters.safeParse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v)));
  const filters = parsed.success ? parsed.data : listFilters.parse({});
  const isStaff = can(ctx.role, "ticket:read:all");
  const basePath = `/o/${org}/tickets`;
  const [page, counts, assignees] = await Promise.all([listTickets(ctx, filters), ticketCounts(ctx), isStaff ? listAssignableMembers(ctx.org.id) : Promise.resolve([])]);
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(Object.entries({ ...raw, page: String(p) }).filter((e): e is [string, string] => !!e[1]));
    return `${basePath}?${q}`;
  };
  const stats = isStaff
    ? [
        { label: "Open", value: counts.open, href: `${basePath}?status=open` },
        { label: "Pending", value: counts.pending, href: `${basePath}?status=pending` },
        { label: "Unassigned", value: counts.unassigned, href: `${basePath}?assignee=unassigned` },
        { label: "Resolved", value: counts.resolved, href: `${basePath}?status=resolved` },
      ]
    : null;

  return (
    <>
      <PageHeader
        title={isStaff ? "Tickets" : "My requests"}
        description={isStaff ? "Urgent first, then most recent activity." : `Requests you've sent to ${ctx.org.name}.`}
        actions={
          <Link href={`${basePath}/new`} className={buttonVariants({ className: "h-9 px-3" })}>
            <Plus className="size-4" aria-hidden /> New ticket
          </Link>
        }
      />
      {stats ? (
        <ul className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <li key={s.label}>
              <Link href={s.href} className="block rounded-xl border bg-card p-4 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mb-4">
        <TicketFilters basePath={basePath} values={raw} isStaff={isStaff} assignees={assignees} />
      </div>
      {page.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={page.total === 0 && !raw.q && !raw.status ? "No tickets yet" : "No tickets match these filters"}
          description={isStaff ? "New tickets from customers will appear here, already triaged when AI is available." : "When you open a request it will show up here."}
          action={
            <Link href={`${basePath}/new`} className={buttonVariants()}>
              <Plus className="size-4" aria-hidden /> New ticket
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          <TicketList items={page.items} basePath={basePath} isStaff={isStaff} />
          <PaginationNav page={page.page} totalPages={page.totalPages} total={page.total} hrefFor={hrefFor} label="tickets" />
        </div>
      )}
    </>
  );
}
