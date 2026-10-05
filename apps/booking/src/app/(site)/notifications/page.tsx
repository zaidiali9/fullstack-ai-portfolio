import { BellOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@portfolio/ui/empty-state";
import { PageHeader } from "@portfolio/ui/page-header";
import { ActionButton } from "@/components/confirm-action-button";
import { TimeAgo } from "@/components/time-ago";
import { cn } from "@/lib/utils";
import { markReadAction } from "@/server/actions/bookings";
import { isTeam, requireCustomer } from "@/server/access";
import { listNotifications } from "@/server/bookings";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default async function NotificationsPage() {
  const user = await requireCustomer();
  const { items, unread } = await listNotifications(user, 50);
  const hrefFor = (bookingId: string | null) => (bookingId ? (isTeam(user) ? `/dashboard/bookings/${bookingId}` : `/my/${bookingId}`) : null);
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        actions={
          unread ? (
            <ActionButton variant="outline" action={markReadAction}>
              Mark all as read
            </ActionButton>
          ) : null
        }
      />
      {items.length ? (
        <ul className="divide-y rounded-xl border bg-card">
          {items.map((n) => {
            const href = hrefFor(n.bookingId);
            const body = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className={cn("font-medium", !n.readAt && "text-primary")}>
                    {!n.readAt ? <span className="mr-2 inline-block size-2 rounded-full bg-brand-clay align-middle" aria-label="Unread" /> : null}
                    {n.title}
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground"><TimeAgo date={n.createdAt} /></span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
              </>
            );
            return (
              <li key={n.id}>
                {href ? (
                  <Link href={href} className="block p-4 hover:bg-muted/50">
                    {body}
                  </Link>
                ) : (
                  <div className="p-4">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={BellOff} title="No notifications yet" description="Booking changes made by the studio or your customers show up here." />
      )}
    </div>
  );
}
