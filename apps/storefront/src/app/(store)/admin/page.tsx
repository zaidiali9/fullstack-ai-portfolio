import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@portfolio/ui/badge";
import { buttonVariants } from "@portfolio/ui/button";
import { Input } from "@portfolio/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@portfolio/ui/table";
import { CATEGORY_LABEL } from "@/components/store/header";
import { money } from "@/lib/money";
import { listAdminProducts } from "@/server/products-admin";

export const metadata: Metadata = { title: "Admin · Products", robots: { index: false } };

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : undefined;
  const products = await listAdminProducts(q);
  return (
    <div className="space-y-4">
      {typeof sp.saved === "string" ? <p className="rounded-lg bg-secondary px-4 py-2 text-sm">Saved “{sp.saved}”. Search embeddings update in the background.</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form method="get" className="w-full max-w-xs" role="search">
          <label htmlFor="admin-q" className="sr-only">
            Search products
          </label>
          <Input id="admin-q" name="q" defaultValue={q} placeholder="Search by name or slug" />
        </form>
        <Link href="/admin/products/new" className={buttonVariants()}>
          <Plus className="size-4" aria-hidden /> New product
        </Link>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Product</TableHead>
              <TableHead className="hidden sm:table-cell">Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 font-medium hover:underline">
                    <span className="relative size-9 shrink-0 overflow-hidden rounded-md border">
                      <Image src={p.imagePath} alt="" fill sizes="36px" className="object-cover" />
                    </span>
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{CATEGORY_LABEL[p.category]}</TableCell>
                <TableCell className="text-right tabular-nums">{money(p.priceCents)}</TableCell>
                <TableCell className={`text-right tabular-nums ${p.stock === 0 ? "text-destructive" : ""}`}>{p.stock}</TableCell>
                <TableCell>{p.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Hidden</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
