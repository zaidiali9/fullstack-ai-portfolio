import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/header";
import { requireTeamPage } from "@/server/access";
import { headerUser } from "@/server/header-user";

export const metadata: Metadata = { title: { default: "Team", template: "%s · Bookwell team" }, robots: { index: false } };

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  await requireTeamPage();
  const user = await headerUser();
  return (
    <>
      <SiteHeader user={user} variant="team" />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}
