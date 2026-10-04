import { ArrowLeft, Lock, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, AvatarFallback } from "@portfolio/ui/avatar";
import { Badge } from "@portfolio/ui/badge";
import { TimeAgo } from "@/components/time-ago";
import { CategoryBadge, PriorityLabel, StatusBadge } from "@/components/tickets/badges";
import { RefreshWhilePending } from "@/components/tickets/refresh-while-pending";
import { ReplyComposer } from "@/components/tickets/reply-composer";
import { SummaryPanel } from "@/components/tickets/summary-panel";
import { TicketProperties } from "@/components/tickets/ticket-properties";
import { TriageCard } from "@/components/tickets/triage-card";
import { aiStatus } from "@/lib/ai";
import { cn } from "@/lib/utils";
import { requireOrg } from "@/server/authz";
import { can } from "@/server/permissions";
import { getTicketByNumber, listAssignableMembers } from "@/server/tickets";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export async function generateMetadata({ params }: PageProps<"/o/[org]/tickets/[number]">): Promise<Metadata> {
  const { number } = await params;
  return { title: `Ticket #${number}` };
}

export default async function TicketPage({ params }: PageProps<"/o/[org]/tickets/[number]">) {
  const { org, number: raw } = await params;
  const number = Number(raw);
  if (!Number.isInteger(number) || number < 1) notFound();
  const ctx = await requireOrg(org);
  const data = await getTicketByNumber(ctx, number).catch((err: { status?: number }) => {
    if (err?.status === 404) notFound();
    throw err;
  });
  const { ticket, messages } = data;
  const isStaff = can(ctx.role, "ticket:update");
  const aiAvailable = !!aiStatus().chat;
  const assignees = isStaff ? await listAssignableMembers(ctx.org.id) : [];

  return (
    <div>
      <RefreshWhilePending pending={ticket.triageStatus === "pending"} />
      <Link href={`/o/${org}/tickets`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All tickets
      </Link>
      <header className="mb-6">
        <p className="font-mono text-xs text-muted-foreground">#{ticket.number}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance">{ticket.subject}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <StatusBadge status={ticket.status} />
          <PriorityLabel priority={ticket.priority} />
          <CategoryBadge category={ticket.category} />
          <span className="text-muted-foreground">
            Opened by {data.requesterName} · <TimeAgo date={ticket.createdAt} />
          </span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-6">
          <ol className="space-y-4" aria-label="Conversation">
            {messages.map((m) => (
              <li key={m.id} className={cn("flex gap-3", !m.fromCustomer && !m.internal && "sm:flex-row-reverse")}>
                <Avatar className="mt-1 size-8 shrink-0">
                  <AvatarFallback className={cn("text-xs", m.fromCustomer ? "bg-secondary" : "bg-primary text-primary-foreground")}>
                    {initials(m.authorName)}
                  </AvatarFallback>
                </Avatar>
                <article
                  className={cn(
                    "min-w-0 flex-1 rounded-xl border p-4 sm:max-w-[85%]",
                    m.internal ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : m.fromCustomer ? "bg-card" : "bg-accent/50",
                  )}
                  aria-label={`${m.internal ? "Internal note" : "Message"} from ${m.authorName}`}
                >
                  <header className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{m.authorName}</span>
                    {m.internal ? (
                      <Badge variant="outline" className="gap-1 border-amber-400 text-amber-900 dark:text-amber-200">
                        <Lock className="size-3" aria-hidden /> Internal
                      </Badge>
                    ) : null}
                    {m.aiAssisted && isStaff ? (
                      <Badge variant="outline" className="gap-1">
                        <Sparkles className="size-3" aria-hidden /> AI-assisted
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      <TimeAgo date={m.createdAt} />
                    </span>
                  </header>
                  <div className="text-sm leading-relaxed break-words whitespace-pre-wrap">{m.body}</div>
                </article>
              </li>
            ))}
          </ol>
          {ticket.status === "closed" && !isStaff ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">This ticket is closed. Open a new ticket if you need more help.</p>
          ) : (
            <ReplyComposer orgSlug={org} number={ticket.number} isStaff={isStaff} aiAvailable={aiAvailable} />
          )}
        </div>

        {isStaff ? (
          <aside className="space-y-4" aria-label="Ticket details">
            <TicketProperties orgSlug={org} ticket={ticket} assignees={assignees} />
            <TriageCard orgSlug={org} ticket={ticket} aiAvailable={aiAvailable} />
            <SummaryPanel orgSlug={org} number={ticket.number} aiAvailable={aiAvailable} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
