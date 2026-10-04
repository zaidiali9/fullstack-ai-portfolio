import Link from "next/link";
import { cn } from "@/lib/utils";

/** Wordmark: three stacked stones (a cairn), original inline SVG. */
export function Brand({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="9" className="fill-primary" />
        <ellipse cx="16" cy="23" rx="8.5" ry="3.6" className="fill-primary-foreground" />
        <ellipse cx="16" cy="16.2" rx="6" ry="3" className="fill-primary-foreground" opacity="0.85" />
        <ellipse cx="16" cy="10.2" rx="3.6" ry="2.4" className="fill-brand-amber" />
      </svg>
      <span>Cairn</span>
    </Link>
  );
}
