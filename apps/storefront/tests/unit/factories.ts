import { randomUUID } from "node:crypto";
import { db, schema } from "@/db";
import type { StoreUser } from "@/server/access";

export async function makeUser(role: "admin" | "customer" = "customer"): Promise<StoreUser> {
  const id = randomUUID();
  const [u] = await db.insert(schema.user).values({ id, name: `${role} ${id.slice(0, 4)}`, email: `${id.slice(0, 8)}@test.demo`, emailVerified: true, role }).returning();
  return { id: u!.id, name: u!.name, email: u!.email, role };
}

let n = 0;
export async function makeProduct(overrides: Partial<typeof schema.products.$inferInsert> = {}) {
  n++;
  const [p] = await db
    .insert(schema.products)
    .values({
      slug: `product-${n}-${randomUUID().slice(0, 6)}`,
      name: `Product ${n}`,
      description: "A useful thing for testing purposes.",
      category: "kitchen",
      priceCents: 1000,
      stock: 10,
      imagePath: "/products/placeholder-kitchen.webp",
      ...overrides,
    })
    .returning();
  return p!;
}

export async function makeCart(userId: string | null = null) {
  const [c] = await db.insert(schema.carts).values({ userId }).returning();
  return c!.id;
}
