import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/store/add-to-cart";
import { CATEGORY_LABEL } from "@/components/store/header";
import { ProductGrid } from "@/components/store/product-card";
import { env } from "@/lib/env";
import { money } from "@/lib/money";
import { getProductBySlug, similarProducts } from "@/server/catalog";

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) return { title: "Product not found" };
  const description = p.description.slice(0, 155);
  return {
    title: p.name,
    description,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: { type: "website", title: p.name, description, images: [{ url: p.imagePath, width: 800, height: 800, alt: p.name }] },
  };
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) notFound();
  const similar = await similarProducts(p, 4);
  const url = `${env().APP_URL}/products/${p.slug}`;
  // schema.org Product structured data for rich results.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    image: `${env().APP_URL}${p.imagePath}`,
    sku: p.slug,
    category: CATEGORY_LABEL[p.category],
    brand: { "@type": "Brand", name: "Fernwood Supply" },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "USD",
      price: (p.priceCents / 100).toFixed(2),
      availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div className="space-y-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap gap-1.5">
          <li>
            <Link href="/products" className="hover:text-foreground">
              Shop
            </Link>{" "}
            /
          </li>
          <li>
            <Link href={`/products?category=${p.category}`} className="hover:text-foreground">
              {CATEGORY_LABEL[p.category]}
            </Link>{" "}
            /
          </li>
          <li aria-current="page" className="text-foreground">
            {p.name}
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <div className="relative aspect-square overflow-hidden rounded-2xl border bg-muted">
          <Image src={p.imagePath} alt={`Illustration of ${p.name}`} fill priority sizes="(min-width: 768px) 560px, 100vw" className="object-cover" />
        </div>
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{p.name}</h1>
          <p className="mt-3 text-2xl">{money(p.priceCents)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{p.stock > 0 ? (p.stock <= 5 ? `Only ${p.stock} left` : "In stock") : "Sold out"}</p>
          <div className="mt-6">
            <AddToCart productId={p.id} stock={p.stock} />
          </div>
          <div className="mt-8 space-y-3 leading-relaxed text-pretty">
            {p.description.split(/\n\n+/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          {Object.keys(p.attributes).length ? (
            <dl className="mt-6 divide-y rounded-xl border text-sm">
              {Object.entries(p.attributes).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-2.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>

      {similar.items.length ? (
        <section aria-labelledby="similar">
          <h2 id="similar" className="mb-1 font-heading text-2xl font-semibold">
            Similar items
          </h2>
          <p className="mb-5 text-sm text-muted-foreground">
            {similar.method === "embedding" ? "Chosen by meaning, using product embeddings." : `More from ${CATEGORY_LABEL[p.category]}.`}
          </p>
          <ProductGrid items={similar.items} />
        </section>
      ) : null}
    </div>
  );
}
