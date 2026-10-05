import { SiteFooter, SiteHeader } from "@/components/site/header";
import { headerUser } from "@/server/header-user";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const user = await headerUser();
  return (
    <>
      <SiteHeader user={user} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
