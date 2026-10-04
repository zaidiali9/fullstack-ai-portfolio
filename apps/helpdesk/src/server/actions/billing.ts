"use server";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { runAction } from "../run-action";
import { requireOrg } from "../authz";
import { createCheckoutSession, createPortalSession } from "../billing";

export async function checkoutAction(orgSlug: string): Promise<FormState> {
  let url = "";
  const state = await runAction(async () => {
    url = await createCheckoutSession(await requireOrg(orgSlug, "billing:manage"));
  });
  if (state.status !== "success") return state;
  redirect(url);
}

export async function portalAction(orgSlug: string): Promise<FormState> {
  let url = "";
  const state = await runAction(async () => {
    url = await createPortalSession(await requireOrg(orgSlug, "billing:manage"));
  });
  if (state.status !== "success") return state;
  redirect(url);
}
