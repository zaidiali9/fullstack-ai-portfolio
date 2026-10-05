import Link from "next/link";
import { cn } from "@/lib/utils";

/** Wordmark: a stylized fern leaf (original inline SVG). */
export function Brand({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 rounded-md font-heading text-lg font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <circle cx="16" cy="16" r="16" className="fill-primary" />
        <path d="M16 26 V8" className="stroke-primary-foreground" strokeWidth="1.8" strokeLinecap="round" />
        {[11, 14.5, 18, 21.5].map((y, i) => (
          <g key={y} className="fill-primary-foreground">
            <ellipse cx={16 - 3.4 + i * 0.4} cy={y} rx={3.6 - i * 0.5} ry="1.3" transform={`rotate(-25 ${16 - 3.4 + i * 0.4} ${y})`} />
            <ellipse cx={16 + 3.4 - i * 0.4} cy={y} rx={3.6 - i * 0.5} ry="1.3" transform={`rotate(25 ${16 + 3.4 - i * 0.4} ${y})`} />
          </g>
        ))}
        <circle cx="16" cy="7.5" r="1.6" className="fill-brand-clay" />
      </svg>
      <span>Fernwood Supply</span>
    </Link>
  );
}
