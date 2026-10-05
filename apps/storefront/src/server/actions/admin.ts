"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { requireAdmin } from "../access";
import { embedPendingProducts } from "../catalog";
import { setOrderStatus } from "../orders";
import { parseAttributes, productInput, saveProduct } from "../products-admin";
import { formObject, runAction } from "../run-action";

export async function saveProductAction(id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  let slug = "";
  const state = await runAction(async () => {
    await requireAdmin();
    const raw = formObject(fd);
    const input = productInput.parse({
      ...raw,
      priceCents: Math.round(Number(raw.price) * 100),
      active: raw.active === "on",
      featured: raw.featured === "on",
      usedAiDraft: raw.usedAiDraft === "true",
      attributes: parseAttributes(raw.attributes ?? ""),
    });
    const p = await saveProduct(id ? z.uuid().parse(id) : null, input);
    slug = p.slug;
    after(() => embedPendingProducts().then(() => undefined, (e: unknown) => console.warn("[catalog] embedding failed", e)));
  });
  if (state.status !== "success") return state;
  revalidatePath("/", "layout");
  redirect(`/admin?saved=${encodeURIComponent(slug)}`);
}

export async function setOrderStatusAction(orderId: string, status: "fulfilled" | "cancelled"): Promise<FormState> {
  return runAction(async () => {
    await requireAdmin();
    await setOrderStatus(z.uuid().parse(orderId), z.enum(["fulfilled", "cancelled"]).parse(status));
    revalidatePath("/admin/orders");
    return { status: "success", message: `Order marked ${status}` };
  });
}
