import type { Metadata } from "next";
import { ProductForm } from "@/components/admin/product-form";
import { aiStatus } from "@/lib/ai";

export const metadata: Metadata = { title: "Admin · New product", robots: { index: false } };

export default function NewProductPage() {
  return (
    <div>
      <h1 className="mb-4 font-heading text-2xl font-semibold">New product</h1>
      <ProductForm aiAvailable={!!aiStatus().chat} />
    </div>
  );
}
