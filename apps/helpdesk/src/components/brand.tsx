import Link from "next/link";
import { cn } from "@/lib/utils";

/** Wordmark: a wave-shaped mark (inline SVG, original artwork) + name. */
export function Brand({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path d="M6 19c3 0 3-4 6-4s3 4 6 4 3-4 6-4 2 2 2 2" fill="none" strokeWidth="2.4" strokeLinecap="round" className="stroke-primary-foreground" />
        <circle cx="24" cy="10" r="2.2" className="fill-brand-coral" />
      </svg>
      <span>Tidal Desk</span>
    </Link>
  );
}
