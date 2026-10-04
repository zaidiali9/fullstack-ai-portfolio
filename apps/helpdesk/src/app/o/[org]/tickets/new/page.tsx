import type { Metadata } from "next";
import { PageHeader } from "@portfolio/ui/page-header";
import { NewTicketForm } from "@/components/tickets/new-ticket-form";
import { requireOrgPage } from "@/server/authz";

export const metadata: Metadata = { title: "New ticket" };

export default async function NewTicketPage({ params }: PageProps<"/o/[org]/tickets/new">) {
  const { org } = await params;
  const ctx = await requireOrgPage(org, "ticket:create");
  return (
    <div className="max-w-2xl">
      <PageHeader title="New ticket" description={`Tell the ${ctx.org.name} team what you need. You'll get updates by email.`} />
      <div className="rounded-xl border bg-card p-5 sm:p-6">
        <NewTicketForm orgSlug={org} />
      </div>
    </div>
  );
}
