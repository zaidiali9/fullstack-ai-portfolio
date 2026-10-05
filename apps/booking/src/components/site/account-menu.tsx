"use client";
import { Activity, CalendarDays, CalendarCheck, LogOut, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@portfolio/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@portfolio/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";

export function AccountMenu({ name, role }: { name: string; role: "owner" | "staff" | "customer" }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Account menu for ${name}`}>
          <UserRound className="size-5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">
          {name}
          <span className="block text-xs font-normal text-muted-foreground capitalize">{role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/my">
            <CalendarCheck className="size-4" aria-hidden /> My bookings
          </Link>
        </DropdownMenuItem>
        {role !== "customer" ? (
          <>
            <DropdownMenuItem asChild>
              <Link href="/dashboard">
                <CalendarDays className="size-4" aria-hidden /> Team calendar
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/activity">
                <Activity className="size-4" aria-hidden /> Activity
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        {role === "owner" ? (
          <DropdownMenuItem asChild>
            <Link href="/dashboard/digest">
              <Sparkles className="size-4" aria-hidden /> Weekly digest
            </Link>
          </DropdownMenuItem>
        ) : null}
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
