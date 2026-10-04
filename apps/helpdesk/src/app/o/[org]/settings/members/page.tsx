import type { Metadata } from "next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@portfolio/ui/table";
import { ActionButton } from "@/components/confirm-action-button";
import { InviteForm, RoleSelect } from "@/components/settings/members";
import { TimeAgo } from "@/components/time-ago";
import { removeMemberAction } from "@/server/actions/orgs";
import { requireOrgPage } from "@/server/authz";
import { listMembers, listPendingInvites } from "@/server/orgs";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ params }: PageProps<"/o/[org]/settings/members">) {
  const { org } = await params;
  const ctx = await requireOrgPage(org, "members:manage");
  const [members, invites] = await Promise.all([listMembers(ctx.org.id), listPendingInvites(ctx.org.id)]);
  return (
    <div className="space-y-6">
      <InviteForm orgSlug={org} />
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Joined</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.membershipId}>
                <TableCell className="font-medium">
                  {m.name}
                  {m.userId === ctx.user.id ? <span className="ml-1 text-xs text-muted-foreground">(you)</span> : null}
                  <span className="block text-xs text-muted-foreground sm:hidden">{m.email}</span>
                </TableCell>
                <TableCell className="hidden text-sm sm:table-cell">{m.email}</TableCell>
                <TableCell>
                  <RoleSelect orgSlug={org} membershipId={m.membershipId} role={m.role} label={m.name} />
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  <TimeAgo date={m.joinedAt} />
                </TableCell>
                <TableCell className="text-right">
                  <ActionButton size="sm" variant="ghost" confirm={`Remove ${m.name} from ${ctx.org.name}?`} action={removeMemberAction.bind(null, org, m.membershipId)}>
                    Remove
                  </ActionButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {invites.length ? (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Pending invitations</h2>
          <ul className="mt-3 divide-y text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{i.email}</span>
                <span className="text-muted-foreground capitalize">
                  {i.role} · expires <TimeAgo date={i.expiresAt} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
