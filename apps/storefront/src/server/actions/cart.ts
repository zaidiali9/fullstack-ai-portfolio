"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { currentUser, requireCustomer } from "../access";
import { cartIdFromCookie, cartLineInput, ensureCart, setQuantity } from "../cart";
import { startCheckout } from "../orders";
import { formObject, runAction } from "../run-action";

export async function addToCartAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const raw = formObject(fd);
    const { productId, quantity } = cartLineInput.parse({ productId: raw.productId, quantity: raw.quantity ?? "1" });
    const user = await currentUser();
    const cartId = await ensureCart(user?.id ?? null);
    const total = await setQuantity(cartId, productId, Math.max(1, quantity), "add");
    revalidatePath("/", "layout");
    return { status: "success", message: `Added to cart (${total} in cart)` };
  });
}

export async function updateCartAction(productId: string, quantity: number): Promise<FormState> {
  return runAction(async () => {
    const line = cartLineInput.parse({ productId, quantity });
    if (!(await cartIdFromCookie())) return { status: "error", message: "Your cart is empty." };
    const user = await currentUser();
    const cartId = await ensureCart(user?.id ?? null);
    await setQuantity(cartId, line.productId, line.quantity, "set");
    revalidatePath("/", "layout");
    return { status: "success" };
  });
}

export async function checkoutAction(): Promise<FormState> {
  let url = "";
  const state = await runAction(async () => {
    const user = await requireCustomer();
    url = await startCheckout(user, await cartIdFromCookie());
  });
  if (state.status !== "success") return state;
  redirect(url);
}
