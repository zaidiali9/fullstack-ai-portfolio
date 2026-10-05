import type { Metadata } from "next";
import Link from "next/link";
import { PaginationNav } from "@portfolio/ui/pagination-nav";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@portfolio/ui/table";
import { ActionButton } from "@/components/confirm-action-button";
import { OrderStatus } from "@/components/store/order-summary";
import { money } from "@/lib/money";
import { setOrderStatusAction } from "@/server/actions/admin";
import { adminOrdersQuery, listAllOrders } from "@/server/orders";

export const metadata: Metadata = { title: "Admin · Orders", robots: { index: false } };

const FILTERS = ["all", "paid", "fulfilled", "pending", "cancelled", "refunded"] as const;

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams;
  const parsed = adminOrdersQuery.safeParse({ status: sp.status, page: sp.page });
  const q = parsed.success ? parsed.data : adminOrdersQuery.parse({});
  const page = await listAllOrders(q);
  return (
    <div className="space-y-4">
      <nav aria-label="Filter orders" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Link key={f} href={`/admin/orders?status=${f}`} aria-current={q.status === f ? "page" : undefined} className={`rounded-md px-3 py-1 text-sm capitalize ${q.status === f ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
            {f}
          </Link>
        ))}
      </nav>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Order</TableHead>
              <TableHead className="hidden sm:table-cell">Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <Link href={`/account/orders/${o.id}`} className="font-medium hover:underline">
                    #{o.number}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{o.createdAt.toLocaleDateString("en-US")}</span>
                </TableCell>
                <TableCell className="hidden text-sm sm:table-cell">{o.email}</TableCell>
                <TableCell>
                  <OrderStatus status={o.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(o.totalCents)}</TableCell>
                <TableCell className="text-right">
                  {o.status === "paid" ? (
                    <ActionButton size="sm" variant="outline" action={setOrderStatusAction.bind(null, o.id, "fulfilled")}>
                      Mark shipped
                    </ActionButton>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <PaginationNav page={page.page} totalPages={page.totalPages} total={page.total} hrefFor={(p) => `/admin/orders?status=${q.status}&page=${p}`} label="orders" />
    </div>
  );
}
