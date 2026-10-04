import { PageHeader } from "@portfolio/ui/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { requireOrgPage } from "@/server/authz";
import { can } from "@/server/permissions";

export default async function SettingsLayout({ children, params }: LayoutProps<"/o/[org]/settings">) {
  const { org } = await params;
  const ctx = await requireOrgPage(org, "usage:read");
  const base = `/o/${org}/settings`;
  const items = [
    ...(can(ctx.role, "org:settings") ? [{ href: base, label: "General" }] : []),
    ...(can(ctx.role, "members:manage") ? [{ href: `${base}/members`, label: "Members" }] : []),
    ...(can(ctx.role, "billing:manage") ? [{ href: `${base}/billing`, label: "Billing" }] : []),
    { href: `${base}/usage`, label: "AI usage" },
    ...(can(ctx.role, "audit:read") ? [{ href: `${base}/audit`, label: "Audit log" }] : []),
    ...(can(ctx.role, "emails:read") ? [{ href: `${base}/emails`, label: "Emails" }] : []),
  ];
  return (
    <>
      <PageHeader title="Settings" description={ctx.org.name} />
      <SettingsNav items={items} />
      {children}
    </>
  );
}
