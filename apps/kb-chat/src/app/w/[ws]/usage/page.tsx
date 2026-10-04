import type { Metadata } from "next";
import { PageHeader } from "@portfolio/ui/page-header";
import { UsagePanel } from "@/components/settings/usage-panel";
import { requireWsPage } from "@/server/authz";

export const metadata: Metadata = { title: "Usage" };

export default async function UsagePage({ params }: PageProps<"/w/[ws]/usage">) {
  const { ws } = await params;
  const ctx = await requireWsPage(ws, "usage:read");
  return (
    <>
      <PageHeader title="Usage" description={ctx.ws.name} />
      <UsagePanel ws={ctx.ws} />
    </>
  );
}
