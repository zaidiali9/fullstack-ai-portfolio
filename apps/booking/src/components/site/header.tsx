import { Bell, UserRound } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { ThemeToggle } from "@portfolio/ui/theme-toggle";
import { Brand } from "@/components/brand";
import { cn } from "@/lib/utils";
import { AccountMenu } from "./account-menu";

export interface HeaderUser {
  name: string;
  role: "owner" | "staff" | "customer";
  unread: number;
}

const navLink = "rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground whitespace-nowrap";

export function SiteHeader({ user, variant = "public" }: { user: HeaderUser | null; variant?: "public" | "team" }) {
  const team = user && user.role !== "customer";
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className={cn("mx-auto flex h-16 items-center gap-2 px-4", variant === "team" ? "max-w-7xl" : "max-w-6xl")}>
        <Brand href={variant === "team" ? "/dashboard" : "/"} className="min-w-0 shrink" />
        {variant === "team" ? <span className="hidden rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground sm:inline">Team</span> : null}
        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 md:flex">
          {variant === "team" ? (
            <>
              <Link href="/dashboard" className={navLink}>
                Calendar
              </Link>
              <Link href="/dashboard/activity" className={navLink}>
                Activity
              </Link>
              {user?.role === "owner" ? (
                <Link href="/dashboard/digest" className={navLink}>
                  Weekly digest
                </Link>
              ) : null}
              <Link href="/" className={navLink}>
                Booking site
              </Link>
            </>
          ) : (
            <>
              <Link href="/#services" className={navLink}>
                Services
              </Link>
              <Link href="/#team" className={navLink}>
                Team
              </Link>
              {user ? (
                <Link href="/my" className={navLink}>
                  My bookings
                </Link>
              ) : null}
              {team ? (
                <Link href="/dashboard" className={navLink}>
                  Dashboard
                </Link>
              ) : null}
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1 md:ml-2">
          <ThemeToggle />
          {user ? (
            <>
              <Link
                href="/notifications"
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
                aria-label={user.unread ? `Notifications, ${user.unread} unread` : "Notifications"}
              >
                <Bell className="size-5" aria-hidden />
                {user.unread ? (
                  <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-brand-clay px-1 text-xs font-semibold text-white dark:text-black" aria-hidden>
                    {user.unread > 9 ? "9+" : user.unread}
                  </span>
                ) : null}
              </Link>
              <AccountMenu name={user.name} role={user.role} />
            </>
          ) : (
            <Link href="/sign-in" className={cn(buttonVariants({ variant: "ghost" }), "gap-1.5")}>
              <UserRound className="size-5" aria-hidden />
              <span>Sign in</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <p>Lumen Wellness Studio is a fictional business (seed data) in a Bookwell portfolio demo.</p>
        <p>Times shown in the studio&apos;s time zone (New York).</p>
      </div>
    </footer>
  );
}
