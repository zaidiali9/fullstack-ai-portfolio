import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@portfolio/ui/button";
import { EmptyState } from "@portfolio/ui/empty-state";
import { TimeAgo } from "@/components/time-ago";
import { requireOrgPage } from "@/server/authz";
import { listAudit } from "@/server/usage";

export const metadata: Metadata = { title: "Audit log" };

function describe(meta: Record<string, unknown> | null) {
  if (!meta) return "";
  if (typeof meta.number === "number") {
    const changes = meta.changes as Record<string, { from: unknown; to: unknown }> | undefined;
    const detail = changes
      ? Object.entries(changes)
          .map(([k, v]) => `${k}: ${String(v.from ?? "none")} → ${String(v.to ?? "none")}`)
          .join(", ")
      : "";
    return `#${meta.number}${detail ? ` (${detail})` : ""}`;
  }
  return Object.entries(meta)
    .filter(([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .slice(0, 4)
    .join(", ");
}

export default async function AuditPage({ params, searchParams }: PageProps<"/o/[org]/settings/audit">) {
  const { org } = await params;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const ctx = await requireOrgPage(org, "audit:read");
  const { items, hasMore } = await listAudit(ctx, page);
  if (items.length === 0 && page === 1) return <EmptyState icon={ScrollText} title="No audit events yet" />;
  return (
    <div className="space-y-4">
      <ol className="divide-y rounded-xl border bg-card">
        {items.map((e) => (
          <li key={e.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <span className="font-mono text-xs">{e.action}</span>
              <span className="ml-2 text-muted-foreground">{describe(e.meta)}</span>
            </div>
            <div className="shrink-0 text-xs text-muted-foreground">
              {e.actorName ?? "System"} · <TimeAgo date={e.createdAt} />
            </div>
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`?page=${page - 1}`}>
            Newer
          </Link>
        ) : null}
        {hasMore ? (
          <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`?page=${page + 1}`}>
            Older
          </Link>
        ) : null}
      </div>
    </div>
  );
}
