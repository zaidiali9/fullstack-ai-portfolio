"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { formObject, runAction } from "../run-action";
import { requireOrg } from "../authz";
import { articleInput, createArticle, deleteArticle, embedPendingArticles, updateArticle } from "../kb";

export async function saveArticleAction(orgSlug: string, id: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  let savedId = id;
  const state = await runAction(async () => {
    const ctx = await requireOrg(orgSlug, "kb:write");
    const raw = formObject(fd);
    const input = articleInput.parse({ ...raw, published: raw.published === "on" });
    const article = id ? await updateArticle(ctx, z.uuid().parse(id), input) : await createArticle(ctx, input);
    savedId = article.id;
    // Embeddings are computed after the response; retrieval falls back to full-text until then.
    after(() => embedPendingArticles(ctx.org.id).then(() => undefined, (e: unknown) => console.warn("[kb] embedding failed", e)));
  });
  if (state.status !== "success") return state;
  revalidatePath(`/o/${orgSlug}/kb`);
  redirect(`/o/${orgSlug}/kb/${savedId}?saved=1`);
}

export async function deleteArticleAction(orgSlug: string, id: string): Promise<FormState> {
  const state = await runAction(async () => {
    const ctx = await requireOrg(orgSlug, "kb:write");
    await deleteArticle(ctx, z.uuid().parse(id));
  });
  if (state.status !== "success") return state;
  revalidatePath(`/o/${orgSlug}/kb`);
  redirect(`/o/${orgSlug}/kb?deleted=1`);
}

export async function reembedAction(orgSlug: string): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requireOrg(orgSlug, "kb:write");
    const n = await embedPendingArticles(ctx.org.id, 200);
    revalidatePath(`/o/${orgSlug}/kb`);
    return { status: "success", message: n ? `Embedded ${n} article${n === 1 ? "" : "s"}` : "Nothing to embed, or embeddings are unavailable" };
  });
}
