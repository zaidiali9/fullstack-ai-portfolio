"use client";
import { AlertTriangle, ArrowDown, ArrowUp, Download, ExternalLink, MoreHorizontal, Columns2, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { ChartSpec } from "@db/schema";
import { Button } from "@portfolio/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@portfolio/ui/dropdown-menu";
import { ResultChart, type ResultView } from "@/components/results/result-chart";
import { ResultTable } from "@/components/results/result-table";
import { cn } from "@/lib/utils";
import { moveTileAction, removeTileAction, tileWidthAction } from "@/server/actions/queries";

export interface TileProps {
  queryId: string;
  title: string;
  width: number;
  chart: ChartSpec;
  result: ResultView | null;
  error: string | null;
  csvHref: string;
  /** Present only for the owner's own dashboard. */
  edit?: { dashboardId: string; first: boolean; last: boolean };
}

export function DashboardTile({ queryId, title, width, chart, result, error, csvHref, edit }: TileProps) {
  const act = async (p: Promise<{ status: string; message?: string }>) => {
    const r = await p;
    if (r.status === "error") toast.error(r.message ?? "Something went wrong.");
  };
  return (
    <article className={cn("flex min-w-0 flex-col rounded-xl border bg-card p-4", width === 2 && "md:col-span-2")} aria-label={title}>
      <header className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="-mt-1 -mr-2 size-8" aria-label={`Options for ${title}`}>
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={csvHref} download>
                <Download className="size-4" aria-hidden /> Download CSV
              </a>
            </DropdownMenuItem>
            {edit ? (
              <>
                <DropdownMenuItem asChild>
                  <Link href={`/queries/${queryId}`}>
                    <ExternalLink className="size-4" aria-hidden /> Open query
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={edit.first} onSelect={() => act(moveTileAction(edit.dashboardId, queryId, -1))}>
                  <ArrowUp className="size-4" aria-hidden /> Move earlier
                </DropdownMenuItem>
                <DropdownMenuItem disabled={edit.last} onSelect={() => act(moveTileAction(edit.dashboardId, queryId, 1))}>
                  <ArrowDown className="size-4" aria-hidden /> Move later
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => act(tileWidthAction(edit.dashboardId, queryId, width === 2 ? 1 : 2))}>
                  <Columns2 className="size-4" aria-hidden /> {width === 2 ? "Half width" : "Full width"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => act(removeTileAction(edit.dashboardId, queryId))}>
                  <Trash2 className="size-4" aria-hidden /> Remove from dashboard
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
        </p>
      ) : result ? (
        chart.type === "table" ? (
          <ResultTable result={result} limit={50} caption={title} />
        ) : (
          <ResultChart spec={chart} result={result} height={width === 2 ? 280 : 240} />
        )
      ) : null}
    </article>
  );
}
