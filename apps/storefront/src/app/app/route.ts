import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { CART_COOKIE, mergeCarts } from "@/server/cart";

/** After sign-in: merge the guest cart into the account's cart, then continue to a same-site page. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const nextParam = url.searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") && !nextParam.startsWith("/\\") ? nextParam : "/";
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(next)}`, env().APP_URL));
  const anon = /(?:^|;\s*)cart_id=([0-9a-f-]{36})/.exec(req.headers.get("cookie") ?? "")?.[1];
  let cartId = anon ? await mergeCarts(session.user.id, anon) : undefined;
  if (!cartId) {
    const [mine] = await db.select({ id: schema.carts.id }).from(schema.carts).where(eq(schema.carts.userId, session.user.id)).orderBy(desc(schema.carts.updatedAt)).limit(1);
    cartId = mine?.id;
  }
  const res = NextResponse.redirect(new URL(next, env().APP_URL));
  if (cartId) res.cookies.set(CART_COOKIE, cartId, { httpOnly: true, sameSite: "lax", secure: env().APP_URL.startsWith("https://"), path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
