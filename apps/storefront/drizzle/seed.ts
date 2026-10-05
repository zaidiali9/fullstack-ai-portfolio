/**
 * Seed script: demo accounts, the fictional Fernwood Supply catalog (SEED DATA), procedurally
 * generated product images, two example past orders for the demo customer, and product embeddings
 * when an embeddings provider is configured (otherwise search falls back to keywords).
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { inArray, sql } from "drizzle-orm";
import { db, dbHandle, schema } from "@/db";
import { aiStatus } from "@/lib/ai";
import { DEMO_PASSWORD } from "@/lib/demo";
import { embedPendingProducts } from "@/server/catalog";
import { CATEGORY_BG, renderProductImage, type Shape } from "./product-art";
import { PRODUCTS } from "./seed-data";

const USERS = [
  { name: "Morgan Reyes", email: "admin@fernwood.demo", role: "admin" },
  { name: "Alex Kim", email: "customer@fernwood.demo", role: "customer" },
];
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const PLACEHOLDER_SHAPE: Record<string, Shape> = { kitchen: "jar", outdoor: "tent", home: "candle", bath: "towel", stationery: "notebook", garden: "pot" };

async function main() {
  const t0 = Date.now();
  const imgDir = path.join(process.cwd(), "public", "products");
  fs.mkdirSync(imgDir, { recursive: true });

  await db.delete(schema.user).where(inArray(schema.user.email, USERS.map((u) => u.email)));
  await db.execute(sql`truncate table order_items, orders, cart_items, carts, products, stripe_events restart identity cascade`);

  const hash = await hashPassword(DEMO_PASSWORD);
  const ids: string[] = [];
  for (const u of USERS) {
    const id = randomUUID();
    ids.push(id);
    await db.insert(schema.user).values({ id, name: u.name, email: u.email, emailVerified: true, role: u.role });
    await db.insert(schema.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
  }

  for (const [cat, shape] of Object.entries(PLACEHOLDER_SHAPE)) {
    await renderProductImage(path.join(imgDir, `placeholder-${cat}.webp`), shape, "#9aa3ad", "#6b7480", CATEGORY_BG[cat]!);
  }
  const rows = [];
  for (const [i, p] of PRODUCTS.entries()) {
    const slug = slugify(p.name);
    await renderProductImage(path.join(imgDir, `${slug}.webp`), p.shape, p.color, p.accent, CATEGORY_BG[p.category]!);
    rows.push({
      slug,
      name: p.name,
      category: p.category,
      description: p.description,
      descriptionSource: "seed" as const,
      priceCents: Math.round(p.price * 100),
      stock: p.stock,
      featured: !!p.featured,
      imagePath: `/products/${slug}.webp`,
      attributes: p.attributes,
      createdAt: new Date(Date.now() - (PRODUCTS.length - i) * 86_400_000),
    });
  }
  const products = await db.insert(schema.products).values(rows).returning();

  // Two example past orders for the demo customer (SEED DATA — not real purchases).
  const customer = ids[1]!;
  const pick = (slug: string) => products.find((p) => p.slug === slug)!;
  for (const [daysAgo, status, lines] of [
    [12, "fulfilled", [[pick("stoneware-morning-mug"), 2], [pick("linen-tea-towel-pair"), 1]]],
    [3, "paid", [[pick("ridgeline-camping-lantern"), 1]]],
  ] as const) {
    const subtotal = lines.reduce((s, [p, q]) => s + p.priceCents * q, 0);
    const shipping = subtotal >= 7500 ? 0 : 800;
    const [o] = await db
      .insert(schema.orders)
      .values({ userId: customer, email: USERS[1]!.email, status, subtotalCents: subtotal, shippingCents: shipping, totalCents: subtotal + shipping, createdAt: new Date(Date.now() - daysAgo * 86_400_000), paidAt: new Date(Date.now() - daysAgo * 86_400_000), shippingName: "Alex Kim (seed data)" })
      .returning();
    await db.insert(schema.orderItems).values(lines.map(([p, q]) => ({ orderId: o!.id, productId: p.id, name: p.name, unitPriceCents: p.priceCents, quantity: q })));
  }

  const emb = aiStatus().embeddings;
  const embedded = await embedPendingProducts();
  console.log(
    `Seeded ${USERS.length} users, ${products.length} products (+${Object.keys(PLACEHOLDER_SHAPE).length} placeholder images), 2 example orders; ` +
      `embedded ${embedded} products (${emb ? `${emb.provider}/${emb.model}` : "embeddings unavailable: keyword search only"}) in ${Date.now() - t0}ms`,
  );
}

main()
  .then(() => dbHandle().close())
  .catch(async (err) => {
    console.error(err);
    await dbHandle().close();
    process.exit(1);
  });
