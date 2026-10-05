import Link from "next/link";
import { requireAdminPage } from "@/server/access";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdminPage();
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <p className="font-heading text-xl font-semibold">Store admin</p>
        <nav aria-label="Admin" className="flex gap-1 text-sm">
          <Link href="/admin" className="rounded-md px-3 py-1.5 hover:bg-muted">
            Products
          </Link>
          <Link href="/admin/orders" className="rounded-md px-3 py-1.5 hover:bg-muted">
            Orders
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
