import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { HttpError } from "@portfolio/kit";
import { db, schema, type DB, type Tx } from "@/db";
import { env } from "@/lib/env";

export const CART_COOKIE = "cart_id";
export const MAX_QTY = 20;
export const cartLineInput = z.object({ productId: z.uuid(), quantity: z.coerce.number().int().min(0).max(MAX_QTY) });

export interface CartLine {
  productId: string;
  slug: string;
  name: string;
  imagePath: string;
  unitPriceCents: number;
  quantity: number;
  stock: number;
  active: boolean;
}

export interface CartView {
  id: string | null;
  lines: CartLine[];
  count: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  /** Lines that can't be bought as-is (out of stock / inactive / quantity above stock). */
  problems: string[];
}

export function totals(lines: Pick<CartLine, "unitPriceCents" | "quantity">[]) {
  const subtotalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const shippingCents = subtotalCents === 0 || subtotalCents >= env().FREE_SHIPPING_OVER_CENTS ? 0 : env().SHIPPING_CENTS;
  return { subtotalCents, shippingCents, totalCents: subtotalCents + shippingCents };
}

const uuid = z.uuid();

/** Cart id from the cookie (read-only; safe in server components). */
export async function cartIdFromCookie(): Promise<string | null> {
  const v = (await cookies()).get(CART_COOKIE)?.value;
  return v && uuid.safeParse(v).success ? v : null;
}

export async function loadCart(cartId: string | null): Promise<CartView> {
  if (!cartId) return { id: null, lines: [], count: 0, subtotalCents: 0, shippingCents: 0, totalCents: 0, problems: [] };
  const lines = await db
    .select({
      productId: schema.products.id,
      slug: schema.products.slug,
      name: schema.products.name,
      imagePath: schema.products.imagePath,
      unitPriceCents: schema.products.priceCents,
      quantity: schema.cartItems.quantity,
      stock: schema.products.stock,
      active: schema.products.active,
    })
    .from(schema.cartItems)
    .innerJoin(schema.products, eq(schema.cartItems.productId, schema.products.id))
    .where(eq(schema.cartItems.cartId, cartId))
    .orderBy(schema.products.name);
  const problems = lines.flatMap((l) =>
    !l.active ? [`${l.name} is no longer available.`] : l.stock === 0 ? [`${l.name} is out of stock.`] : l.quantity > l.stock ? [`Only ${l.stock} × ${l.name} left in stock.`] : [],
  );
  return { id: cartId, lines, count: lines.reduce((n, l) => n + l.quantity, 0), ...totals(lines), problems };
}

export async function currentCart(): Promise<CartView> {
  return loadCart(await cartIdFromCookie());
}

/** Get (or create) the cart for this browser and remember it in an httpOnly cookie. Server actions only. */
export async function ensureCart(userId: string | null): Promise<string> {
  const jar = await cookies();
  const existing = await cartIdFromCookie();
  if (existing) {
    const [c] = await db.select().from(schema.carts).where(eq(schema.carts.id, existing)).limit(1);
    // Never let a signed-in user write to someone else's cart via a copied cookie.
    if (c && (!c.userId || c.userId === userId)) {
      if (!c.userId && userId) await db.update(schema.carts).set({ userId }).where(eq(schema.carts.id, c.id));
      return c.id;
    }
  }
  const [c] = await db.insert(schema.carts).values({ userId }).returning({ id: schema.carts.id });
  jar.set(CART_COOKIE, c!.id, { httpOnly: true, sameSite: "lax", secure: env().NODE_ENV === "production" && env().APP_URL.startsWith("https://"), path: "/", maxAge: 60 * 60 * 24 * 30 });
  return c!.id;
}

/** Set a line's quantity (0 removes it). Validates the product is active and in stock. */
export async function setQuantity(cartId: string, productId: string, quantity: number, mode: "set" | "add" = "set", database: DB | Tx = db) {
  const [p] = await database.select({ stock: schema.products.stock, active: schema.products.active, name: schema.products.name }).from(schema.products).where(eq(schema.products.id, productId)).limit(1);
  if (!p || !p.active) throw new HttpError(404, "not_found", "That product isn't available.");
  const [line] = await database
    .select({ quantity: schema.cartItems.quantity })
    .from(schema.cartItems)
    .where(and(eq(schema.cartItems.cartId, cartId), eq(schema.cartItems.productId, productId)))
    .limit(1);
  const next = mode === "add" ? (line?.quantity ?? 0) + quantity : quantity;
  if (next <= 0) {
    await database.delete(schema.cartItems).where(and(eq(schema.cartItems.cartId, cartId), eq(schema.cartItems.productId, productId)));
    return 0;
  }
  if (next > MAX_QTY) throw new HttpError(400, "quantity_limit", `You can buy at most ${MAX_QTY} of one item.`);
  if (next > p.stock) throw new HttpError(409, "insufficient_stock", p.stock === 0 ? `${p.name} is out of stock.` : `Only ${p.stock} × ${p.name} left in stock.`);
  await database
    .insert(schema.cartItems)
    .values({ cartId, productId, quantity: next })
    .onConflictDoUpdate({ target: [schema.cartItems.cartId, schema.cartItems.productId], set: { quantity: next } });
  await database.update(schema.carts).set({ updatedAt: sql`now()` }).where(eq(schema.carts.id, cartId));
  return next;
}

/** When a user signs in, move items from their anonymous cart into their existing cart (max of quantities). */
export async function mergeCarts(userId: string, anonymousCartId: string) {
  const [anon] = await db.select().from(schema.carts).where(eq(schema.carts.id, anonymousCartId)).limit(1);
  if (!anon || anon.userId) return anonymousCartId;
  const [mine] = await db.select().from(schema.carts).where(eq(schema.carts.userId, userId)).orderBy(sql`${schema.carts.updatedAt} desc`).limit(1);
  if (!mine) {
    await db.update(schema.carts).set({ userId }).where(eq(schema.carts.id, anon.id));
    return anon.id;
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into cart_items (cart_id, product_id, quantity)
      select ${mine.id}, product_id, quantity from cart_items where cart_id = ${anon.id}
      on conflict (cart_id, product_id) do update set quantity = least(20, greatest(cart_items.quantity, excluded.quantity))`);
    await tx.delete(schema.carts).where(eq(schema.carts.id, anon.id));
  });
  return mine.id;
}
