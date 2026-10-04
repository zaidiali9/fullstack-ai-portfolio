import { Mail } from "lucide-react";
import type { Metadata } from "next";
import { Badge } from "@portfolio/ui/badge";
import { EmptyState } from "@portfolio/ui/empty-state";
import { TimeAgo } from "@/components/time-ago";
import { env } from "@/lib/env";
import { requireOrgPage } from "@/server/authz";
import { listEmails } from "@/server/usage";

export const metadata: Metadata = { title: "Emails" };

export default async function EmailsPage({ params }: PageProps<"/o/[org]/settings/emails">) {
  const { org } = await params;
  const ctx = await requireOrgPage(org, "emails:read");
  const emails = await listEmails(ctx);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {env().SMTP_URL
          ? "Notification emails are delivered through the configured SMTP server."
          : "No SMTP server is configured, so notification emails are logged here instead of being sent (set SMTP_URL, e.g. Mailpit, to deliver them)."}
      </p>
      {emails.length === 0 ? (
        <EmptyState icon={Mail} title="No emails yet" description="New tickets, replies and invitations create notification emails." />
      ) : (
        <ul className="space-y-3">
          {emails.map((e) => (
            <li key={e.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">{e.subject}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={e.status === "failed" ? "destructive" : "secondary"}>{e.status}</Badge>
                  <TimeAgo date={e.createdAt} />
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">To: {e.to}</p>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-muted-foreground">Show message</summary>
                <pre className="mt-2 font-sans text-sm break-words whitespace-pre-wrap">{e.text}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
