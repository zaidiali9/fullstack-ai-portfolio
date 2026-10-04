import { MobileHeader, Sidebar, type NavProps } from "@/components/shell/app-nav";
import { requireOrg } from "@/server/authz";
import { listMyOrgs } from "@/server/orgs";

export default async function OrgLayout({ children, params }: LayoutProps<"/o/[org]">) {
  const { org: slug } = await params;
  const ctx = await requireOrg(slug);
  const orgs = await listMyOrgs(ctx.user.id);
  const nav: NavProps = {
    org: { slug: ctx.org.slug, name: ctx.org.name, plan: ctx.org.plan },
    orgs,
    user: { name: ctx.user.name, email: ctx.user.email },
    role: ctx.role,
  };
  return (
    <div className="flex min-h-svh">
      <Sidebar {...nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader {...nav} />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
