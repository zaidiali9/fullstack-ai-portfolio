"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "./dropdown-menu";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change color theme">
          <Sun className="size-4 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" aria-hidden />
          <Moon className="absolute size-4 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={mounted ? theme : undefined} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light"><Sun className="size-4" aria-hidden /> Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon className="size-4" aria-hidden /> Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor className="size-4" aria-hidden /> System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
