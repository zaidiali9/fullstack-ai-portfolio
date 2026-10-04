import { ExternalLink, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import { buttonVariants } from "@portfolio/ui/button";
import { PageHeader } from "@portfolio/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@portfolio/ui/table";
import { ActionButton } from "@/components/confirm-action-button";
import { AddMemberForm, RoleSelect, WidgetForm } from "@/components/settings/settings-forms";
import { UsagePanel } from "@/components/settings/usage-panel";
import { env } from "@/lib/env";
import { removeMemberAction, rotateWidgetKeyAction } from "@/server/actions/workspace";
import { requireWsPage } from "@/server/authz";
import { listMembers } from "@/server/workspaces";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/w/[ws]/settings">) {
  const { ws } = await params;
  const ctx = await requireWsPage(ws, "workspace:settings");
  const members = await listMembers(ctx.ws.id);
  const app = env().APP_URL;
  const snippet = `<script src="${app}/widget.js" data-key="${ctx.ws.widgetKey}" async></script>`;
  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description={ctx.ws.name} className="pb-0" />

      <section aria-labelledby="usage-h" className="space-y-3">
        <h2 id="usage-h" className="text-lg font-semibold">
          Usage
        </h2>
        <UsagePanel ws={ctx.ws} />
      </section>

      <section aria-labelledby="members-h" className="space-y-3">
        <h2 id="members-h" className="text-lg font-semibold">
          Members
        </h2>
        <div className="rounded-xl border bg-card p-5">
          <AddMemberForm slug={ws} />
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.memberId}>
                  <TableCell className="font-medium">
                    {m.name}
                    {m.userId === ctx.user.id ? <span className="ml-1 text-xs text-muted-foreground">(you)</span> : null}
                  </TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">{m.email}</TableCell>
                  <TableCell>
                    <RoleSelect slug={ws} memberId={m.memberId} role={m.role} label={m.name} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ActionButton size="sm" variant="ghost" confirm={`Remove ${m.name}?`} action={removeMemberAction.bind(null, ws, m.memberId)}>
                      Remove
                    </ActionButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="widget-h" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="widget-h" className="text-lg font-semibold">
            Website widget
          </h2>
          <div className="flex gap-2">
            {ctx.ws.widgetEnabled ? (
              <a href={`/embed/${ctx.ws.widgetKey}`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ExternalLink className="size-3.5" aria-hidden /> Preview
              </a>
            ) : null}
            <ActionButton size="sm" variant="outline" confirm="Generate a new key? Existing embeds stop working until updated." action={rotateWidgetKeyAction.bind(null, ws)}>
              <RefreshCw className="size-3.5" aria-hidden /> New key
            </ActionButton>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Let website visitors ask questions about this workspace&apos;s documents. Anonymous questions are rate limited and count toward the monthly limit.
        </p>
        <div className="rounded-xl border bg-card p-5">
          <WidgetForm slug={ws} enabled={ctx.ws.widgetEnabled} greeting={ctx.ws.widgetGreeting} origins={ctx.ws.widgetAllowedOrigins} snippet={snippet} />
        </div>
      </section>
    </div>
  );
}
