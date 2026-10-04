import { MobileHeader, Sidebar, type NavProps } from "@/components/shell/app-nav";
import { requireWs } from "@/server/authz";
import { listMyWorkspaces } from "@/server/workspaces";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[ws]">) {
  const { ws: slug } = await params;
  const ctx = await requireWs(slug);
  const list = await listMyWorkspaces(ctx.user.id);
  const nav: NavProps = {
    org: { slug: ctx.ws.slug, name: ctx.ws.name, plan: `${ctx.role[0]!.toUpperCase()}${ctx.role.slice(1)}` },
    orgs: list,
    user: { name: ctx.user.name, email: ctx.user.email },
    role: ctx.role,
  };
  return (
    <div className="flex min-h-svh">
      <Sidebar {...nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader {...nav} />
        <main id="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
