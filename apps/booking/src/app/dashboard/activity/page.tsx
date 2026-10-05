import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@portfolio/ui/empty-state";
import { PageHeader } from "@portfolio/ui/page-header";
import { TimeAgo } from "@/components/time-ago";
import { listActivity } from "@/server/bookings";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const items = await listActivity(100);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Activity" description="Every booking, cancellation, move and outcome, newest first." />
      {items.length ? (
        <ol className="divide-y rounded-xl border bg-card">
          {items.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-4 p-4 text-sm">
              <div className="min-w-0">
                {a.bookingId ? (
                  <Link href={`/dashboard/bookings/${a.bookingId}`} className="hover:underline">
                    {a.summary}
                  </Link>
                ) : (
                  a.summary
                )}
                <p className="text-xs text-muted-foreground">{a.type.replace("booking.", "").replace("_", "-")}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                <TimeAgo date={a.createdAt} />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState icon={History} title="No activity yet" description="Bookings and changes will appear here as they happen." />
      )}
    </div>
  );
}
