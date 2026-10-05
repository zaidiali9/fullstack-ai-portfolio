import Image from "next/image";
import Link from "next/link";
import { money } from "@/lib/money";
import type { ProductCard as Card } from "@/server/catalog";

export function ProductCard({ p, priority }: { p: Card; priority?: boolean }) {
  return (
    <Link href={`/products/${p.slug}`} className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <div className="relative aspect-square overflow-hidden rounded-xl border bg-muted">
        <Image
          src={p.imagePath}
          alt=""
          fill
          sizes="(min-width: 1024px) 270px, (min-width: 640px) 33vw, 50vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          priority={priority}
        />
        {p.stock === 0 ? <span className="absolute top-2 left-2 rounded-md bg-background/90 px-2 py-0.5 text-xs font-medium">Sold out</span> : null}
      </div>
      <h3 className="mt-3 text-sm leading-snug font-medium group-hover:underline">{p.name}</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{money(p.priceCents)}</p>
    </Link>
  );
}

export function ProductGrid({ items, priorityCount = 0 }: { items: Card[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((p, i) => (
        <li key={p.id}>
          <ProductCard p={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
