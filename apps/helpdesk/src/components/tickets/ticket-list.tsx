import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@portfolio/ui/table";
import { TimeAgo } from "@/components/time-ago";
import type { TicketListItem } from "@/server/tickets";
import { CategoryBadge, PriorityLabel, SentimentIcon, StatusBadge } from "./badges";

function TriageHint({ t }: { t: TicketListItem }) {
  if (t.triageStatus === "pending") return <span className="text-xs text-muted-foreground">Triaging…</span>;
  if (t.triageStatus === "unavailable") return <span className="text-xs text-muted-foreground">AI unavailable</span>;
  if (t.triageStatus === "failed") return <span className="text-xs text-muted-foreground">Triage failed</span>;
  return null;
}

/** Table on wide screens, stacked cards on phones (360px+). */
export function TicketList({ items, basePath, isStaff }: { items: TicketListItem[]; basePath: string; isStaff: boolean }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-20">#</TableHead>
              <TableHead>Subject</TableHead>
              {isStaff ? <TableHead>Requester</TableHead> : null}
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="hidden lg:table-cell">Category</TableHead>
              {isStaff ? <TableHead className="hidden xl:table-cell">Assignee</TableHead> : null}
              <TableHead className="text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((t) => (
              <TableRow key={t.id} className="group">
                <TableCell className="font-mono text-xs text-muted-foreground">{t.number}</TableCell>
                <TableCell className="max-w-md">
                  <Link href={`${basePath}/${t.number}`} className="font-medium underline-offset-4 outline-none group-hover:underline focus-visible:underline">
                    {t.subject}
                  </Link>
                  {isStaff && t.aiSummary ? (
                    <p className="mt-0.5 flex items-start gap-1 truncate text-xs text-muted-foreground" title="AI triage summary">
                      <Sparkles className="mt-0.5 size-3 shrink-0" aria-label="AI summary" />
                      <span className="truncate">{t.aiSummary}</span>
                    </p>
                  ) : (
                    <TriageHint t={t} />
                  )}
                </TableCell>
                {isStaff ? (
                  <TableCell className="text-sm">
                    <span className="inline-flex items-center gap-1.5">
                      {t.requesterName} <SentimentIcon sentiment={t.sentiment} />
                    </span>
                  </TableCell>
                ) : null}
                <TableCell>
                  <StatusBadge status={t.status} />
                </TableCell>
                <TableCell>
                  <PriorityLabel priority={t.priority} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <CategoryBadge category={t.category} />
                </TableCell>
                {isStaff ? <TableCell className="hidden text-sm xl:table-cell">{t.assigneeName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell> : null}
                <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
                  <TimeAgo date={t.lastMessageAt} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-3 md:hidden">
        {items.map((t) => (
          <li key={t.id}>
            <Link href={`${basePath}/${t.number}`} className="block rounded-xl border bg-card p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">#{t.number}</span>
                  {t.subject}
                </p>
                <StatusBadge status={t.status} />
              </div>
              {isStaff && t.aiSummary ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.aiSummary}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <PriorityLabel priority={t.priority} />
                <CategoryBadge category={t.category} />
                <span className="ml-auto text-xs text-muted-foreground">
                  <TimeAgo date={t.lastMessageAt} />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
