import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ProductForm } from "@/components/admin/product-form";
import { aiStatus } from "@/lib/ai";
import { getAdminProduct } from "@/server/products-admin";

export const metadata: Metadata = { title: "Admin · Edit product", robots: { index: false } };

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const p = await getAdminProduct(id).catch(() => notFound());
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-heading text-2xl font-semibold">Edit {p.name}</h1>
        <Link href={`/products/${p.slug}`} className="text-sm text-primary hover:underline">
          View in store
        </Link>
      </div>
      <ProductForm product={p} aiAvailable={!!aiStatus().chat} />
    </div>
  );
}
