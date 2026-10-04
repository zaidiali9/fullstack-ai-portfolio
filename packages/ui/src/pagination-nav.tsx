import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "./button";
import { cn } from "./utils";

/** Server-rendered pagination using links (works without JS, keeps filters in the URL). */
export function PaginationNav({ page, totalPages, total, hrefFor, label = "items" }: { page: number; totalPages: number; total: number; hrefFor: (page: number) => string; label?: string }) {
  if (totalPages <= 1) return <p className="text-sm text-muted-foreground">{total} {label}</p>;
  return (
    <nav className="flex items-center justify-between gap-4" aria-label="Pagination">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages} · {total} {label}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={hrefFor(page - 1)} rel="prev">
            <ChevronLeft className="size-4" aria-hidden /> Previous
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")} aria-disabled="true">
            <ChevronLeft className="size-4" aria-hidden /> Previous
          </span>
        )}
        {page < totalPages ? (
          <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={hrefFor(page + 1)} rel="next">
            Next <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")} aria-disabled="true">
            Next <ChevronRight className="size-4" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
