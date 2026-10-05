import { AppHeader } from "@/components/app/header";
import { requireAppUser } from "@/server/access";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireAppUser();
  return (
    <>
      <AppHeader user={{ name: user.name, role: user.role }} />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}
