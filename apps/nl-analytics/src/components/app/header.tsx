import { UserRound } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { ThemeToggle } from "@portfolio/ui/theme-toggle";
import { Brand } from "@/components/brand";
import { cn } from "@/lib/utils";
import { AccountMenu } from "./account-menu";
import { NavLinks } from "./nav-links";

export function AppHeader({ user }: { user: { name: string; role: "admin" | "analyst" } | null }) {
  const links = [
    { href: "/ask", label: "Ask" },
    { href: "/queries", label: "Saved queries" },
    { href: "/dashboards", label: "Dashboards" },
    ...(user?.role === "admin" ? [{ href: "/admin", label: "Activity" }] : []),
  ];
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <Brand href={user ? "/ask" : "/"} />
        {user ? <NavLinks links={links} className="ml-4 hidden md:flex" /> : null}
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {user ? (
            <AccountMenu name={user.name} role={user.role} links={links} />
          ) : (
            <Link href="/sign-in" className={cn(buttonVariants({ variant: "ghost" }), "gap-1.5")}>
              <UserRound className="size-5" aria-hidden />
              Sign in
            </Link>
          )}
        </div>
      </div>
      {user ? <NavLinks links={links} className="flex overflow-x-auto border-t px-2 py-1 md:hidden" /> : null}
    </header>
  );
}
