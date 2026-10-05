import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { makeCart, makeProduct, makeUser } from "./factories";

// Only Next.js runtime pieces are mocked: the session lookup, the cookie jar, cache revalidation,
// redirect and after(). Authorization, validation and database writes run for real (AI = stub).
const state = vi.hoisted(() => ({
  user: null as null | { id: string; name: string; email: string; role: string },
  jar: new Map<string, string>(),
  after: [] as (() => unknown)[],
}));
vi.mock("@/server/session", () => ({
  getSession: async () => (state.user ? { user: state.user } : null),
  requireUser: async () => {
    if (!state.user) throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" });
    return state.user;
  },
  requireUserApi: async () => {
    const { unauthorized } = await import("@portfolio/kit");
    if (!state.user) throw unauthorized();
    return state.user;
  },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => (state.user ? { user: state.user } : null) } } }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (state.jar.has(k) ? { value: state.jar.get(k) } : undefined), set: (k: string, v: string) => void state.jar.set(k, v) }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void state.after.push(fn) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));

const cartActions = await import("@/server/actions/cart");
const adminActions = await import("@/server/actions/admin");
const describeRoute = await import("@/app/api/admin/describe/route");
const appRoute = await import("@/app/app/route");
const { loadCart } = await import("@/server/cart");

const idle = { status: "idle" as const };
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const ORIGIN = "http://localhost:3003";

beforeEach(() => {
  state.jar.clear();
  state.after = [];
  state.user = null;
});

describe("cart actions", () => {
  it("guest add-to-cart creates a cart cookie and respects stock", async () => {
    const p = await makeProduct({ stock: 2 });
    expect(await cartActions.addToCartAction(idle, fd({ productId: p.id, quantity: "2" }))).toMatchObject({ status: "success", message: "Added to cart (2 in cart)" });
    const cartId = state.jar.get("cart_id")!;
    expect(cartId).toMatch(/[0-9a-f-]{36}/);
    expect(await cartActions.addToCartAction(idle, fd({ productId: p.id, quantity: "1" }))).toMatchObject({ status: "error", message: /Only 2/ });
    expect(await cartActions.addToCartAction(idle, fd({ productId: "not-a-uuid" }))).toMatchObject({ status: "error" });
    expect(await cartActions.updateCartAction(p.id, 1)).toMatchObject({ status: "success" });
    expect((await loadCart(cartId)).lines[0]!.quantity).toBe(1);
  });

  it("a copied cookie can't be used to edit another user's cart", async () => {
    const owner = await makeUser();
    const victimCart = await makeCart(owner.id);
    const p = await makeProduct();
    state.user = await makeUser();
    state.jar.set("cart_id", victimCart);
    await cartActions.addToCartAction(idle, fd({ productId: p.id }));
    expect(state.jar.get("cart_id")).not.toBe(victimCart);
    expect((await loadCart(victimCart)).lines).toEqual([]);
  });

  it("checkout requires sign-in and a non-empty cart", async () => {
    const err = (await cartActions.checkoutAction().catch((e: unknown) => e)) as { digest?: string };
    expect(err.digest).toContain("/sign-in");
    state.user = await makeUser();
    expect(await cartActions.checkoutAction()).toMatchObject({ status: "error", message: "Your cart is empty." });
  });
});

describe("admin-only actions and routes", () => {
  it("customers cannot save products or change orders", async () => {
    state.user = await makeUser("customer");
    expect(await adminActions.saveProductAction(null, idle, fd({ name: "Sneaky", category: "home", description: "Trying to add a product.", price: "1", stock: "1" }))).toMatchObject({ status: "error" });
    expect(await adminActions.setOrderStatusAction("00000000-0000-0000-0000-000000000000", "fulfilled")).toMatchObject({ status: "error" });
  });

  it("admins save products (embedding refreshed in the background)", async () => {
    state.user = await makeUser("admin");
    const err = (await adminActions
      .saveProductAction(null, idle, fd({ name: "Hemp Market Bag", category: "home", description: "A sturdy bag for the farmers market.", price: "18.50", stock: "12", active: "on", attributes: "Material: Hemp\nSize: 40 × 35 cm" }))
      .catch((e: unknown) => e)) as { digest?: string };
    expect(err.digest).toContain("/admin?saved=hemp-market-bag");
    const [p] = await db.select().from(schema.products).where(eq(schema.products.slug, "hemp-market-bag"));
    expect(p).toMatchObject({ priceCents: 1850, stock: 12, active: true, featured: false, attributes: { Material: "Hemp", Size: "40 × 35 cm" }, descriptionSource: "manual" });
    expect(state.after).toHaveLength(1);
  });

  it("the AI description route is admin-only and returns a validated draft (stub AI)", async () => {
    const req = () =>
      new Request(`${ORIGIN}/api/admin/describe`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, host: "localhost:3003" },
        body: JSON.stringify({ name: "Hemp Market Bag", category: "home", attributes: "Material: Hemp" }),
      });
    state.user = null;
    expect((await describeRoute.POST(req())).status).toBe(401);
    state.user = await makeUser("customer");
    expect((await describeRoute.POST(req())).status).toBe(403);
    state.user = await makeUser("admin");
    const ok = await describeRoute.POST(req());
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { draft: { description: string; highlights: string[] }; warnings: string[] };
    expect(body.draft.description).toContain("[stub]");
    expect(body.draft.highlights.length).toBeGreaterThanOrEqual(2);
  });
});

describe("post-sign-in merge route", () => {
  it("merges the guest cart, sets the cookie and only redirects to same-site paths", async () => {
    const user = await makeUser();
    state.user = user;
    const p = await makeProduct();
    const guest = await makeCart();
    const { setQuantity } = await import("@/server/cart");
    await setQuantity(guest, p.id, 2);
    const res = await appRoute.GET(new Request(`${ORIGIN}/app?next=%2Fcart`, { headers: { cookie: `cart_id=${guest}` } }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/cart`);
    expect(res.headers.get("set-cookie")).toContain(`cart_id=${guest}`);
    const [c] = await db.select().from(schema.carts).where(eq(schema.carts.id, guest));
    expect(c!.userId).toBe(user.id);
    const evil = await appRoute.GET(new Request(`${ORIGIN}/app?next=%2F%2Fevil.example`));
    expect(evil.headers.get("location")).toBe(`${ORIGIN}/`);
  });
});
