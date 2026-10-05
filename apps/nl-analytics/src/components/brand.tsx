import Link from "next/link";
import { cn } from "@/lib/utils";

/** Wordmark: four tally bars with a diagonal stroke (original inline SVG). */
export function Brand({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 rounded-md font-heading text-lg font-bold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", className)}>
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary" />
        {[9, 13.5, 18, 22.5].map((x) => (
          <rect key={x} x={x - 1} y="8" width="2" height="16" rx="1" className="fill-primary-foreground" />
        ))}
        <path d="M6.5 21 L25.5 11" className="stroke-brand-clay" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span>Tally</span>
    </Link>
  );
}
