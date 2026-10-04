"use client";
import { BookOpenText, ChevronsUpDown, Inbox, LogOut, Menu, Settings, Ticket } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@portfolio/ui/avatar";
import { Button } from "@portfolio/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@portfolio/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@portfolio/ui/sheet";
import { ThemeToggle } from "@portfolio/ui/theme-toggle";
import { Brand } from "@/components/brand";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export interface NavProps {
  org: { slug: string; name: string; plan: string };
  orgs: { slug: string; name: string; role: string }[];
  user: { name: string; email: string };
  role: "admin" | "agent" | "customer";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function NavLinks({ org, role, onNavigate }: Pick<NavProps, "org" | "role"> & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const base = `/o/${org.slug}`;
  const items = [
    { href: `${base}/tickets`, label: role === "customer" ? "My requests" : "Tickets", icon: role === "customer" ? Inbox : Ticket },
    { href: `${base}/kb`, label: role === "customer" ? "Help articles" : "Knowledge base", icon: BookOpenText },
    ...(role === "admin" ? [{ href: `${base}/settings`, label: "Settings", icon: Settings }] : role === "agent" ? [{ href: `${base}/settings/usage`, label: "AI usage", icon: Settings }] : []),
  ];
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function OrgSwitcher({ org, orgs }: Pick<NavProps, "org" | "orgs">) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-auto w-full justify-between px-2.5 py-2 text-left">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{org.name}</span>
            <span className="block text-xs text-muted-foreground capitalize">{org.plan} plan</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
          <span className="sr-only">Switch organization</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {orgs.map((o) => (
          <DropdownMenuItem key={o.slug} asChild>
            <Link href={`/o/${o.slug}/tickets`}>
              <span className="flex-1 truncate">{o.name}</span>
              <span className="text-xs text-muted-foreground capitalize">{o.role}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">Create organization</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user, role }: Pick<NavProps, "user" | "role">) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto w-full justify-start gap-2 px-2 py-1.5">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block text-xs text-muted-foreground capitalize">{role}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut className="size-4" aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar(props: NavProps) {
  return (
    <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r bg-sidebar lg:flex" aria-label="Sidebar">
      <div className="flex h-14 items-center justify-between px-4">
        <Brand href={`/o/${props.org.slug}/tickets`} />
        <ThemeToggle />
      </div>
      <div className="px-3">
        <OrgSwitcher org={props.org} orgs={props.orgs} />
      </div>
      <nav className="mt-4 flex-1 px-3" aria-label="Primary">
        <NavLinks org={props.org} role={props.role} />
      </nav>
      <div className="border-t p-3">
        <UserMenu user={props.user} role={props.role} />
      </div>
    </aside>
  );
}

export function MobileHeader(props: NavProps) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu className="size-5" aria-hidden />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>
              <Brand href={`/o/${props.org.slug}/tickets`} />
            </SheetTitle>
          </SheetHeader>
          <div className="px-3">
            <OrgSwitcher org={props.org} orgs={props.orgs} />
          </div>
          <nav className="mt-4 flex-1 px-3" aria-label="Primary">
            <NavLinks org={props.org} role={props.role} onNavigate={() => setOpen(false)} />
          </nav>
          <div className="border-t p-3">
            <UserMenu user={props.user} role={props.role} />
          </div>
        </SheetContent>
      </Sheet>
      <span className="truncate px-2 text-sm font-semibold">{props.org.name}</span>
      <ThemeToggle />
    </header>
  );
}
