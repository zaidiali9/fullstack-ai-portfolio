import Link from "next/link";
import { cn } from "@/lib/utils";

/** Wordmark: a rising sun over a horizon line (original inline SVG). */
export function Brand({ href = "/", label = "Lumen Wellness", className }: { href?: string; label?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 rounded-md font-heading text-lg font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", className)}>
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="9" className="fill-primary" />
        <circle cx="16" cy="19" r="6" className="fill-brand-clay" />
        <rect x="5" y="19" width="22" height="8" className="fill-primary" />
        <path d="M6 19.5 H26" className="stroke-primary-foreground" strokeWidth="1.6" strokeLinecap="round" />
        {[-50, -25, 0, 25, 50].map((deg) => (
          <path key={deg} d="M16 9.5 V7" className="stroke-primary-foreground" strokeWidth="1.6" strokeLinecap="round" transform={`rotate(${deg} 16 19)`} />
        ))}
      </svg>
      <span className="truncate">{label}</span>
    </Link>
  );
}
