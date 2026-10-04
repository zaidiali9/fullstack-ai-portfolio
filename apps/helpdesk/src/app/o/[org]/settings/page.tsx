import type { Metadata } from "next";
import { GeneralForm } from "@/components/settings/general-form";
import { env } from "@/lib/env";
import { requireOrgPage } from "@/server/authz";

export const metadata: Metadata = { title: "Settings" };

export default async function GeneralSettingsPage({ params }: PageProps<"/o/[org]/settings">) {
  const { org } = await params;
  const ctx = await requireOrgPage(org, "org:settings");
  return <GeneralForm orgSlug={org} name={ctx.org.name} allowCustomerSignup={ctx.org.allowCustomerSignup} portalUrl={`${env().APP_URL}/join/${org}`} />;
}
