"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { enforceRateLimit } from "@portfolio/kit";
import { db } from "@/db";
import type { FormState } from "@/lib/form-state";
import { requireWs } from "../authz";
import { deleteConversation } from "../chat";
import { addUrl, deleteDocument, retryDocument, urlInput } from "../documents";
import { runJobs } from "../ingest/pipeline";
import { formObject, runAction } from "../run-action";
import { requireUser } from "../session";
import {
  addMember,
  addMemberInput,
  changeRole,
  createWorkspace,
  createWsInput,
  removeMember,
  roleInput,
  rotateWidgetKey,
  updateWidget,
  widgetInput,
} from "../workspaces";

export async function createWorkspaceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let slug = "";
  const state = await runAction(async () => {
    const user = await requireUser();
    slug = (await createWorkspace(user, createWsInput.parse(formObject(fd)))).slug;
  });
  if (state.status !== "success") return state;
  redirect(`/w/${slug}/documents`);
}

export async function addUrlAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requireWs(slug, "docs:write");
    await enforceRateLimit(db, `url:${ctx.user.id}`, { limit: 10, windowMs: 60_000, message: "Too many URLs at once. Please wait a minute." });
    const doc = await addUrl(ctx, urlInput.parse(formObject(fd)).url);
    after(() => runJobs({ timeBudgetMs: 120_000 }));
    revalidatePath(`/w/${slug}/documents`);
    return { status: "success", message: `Added ${doc.title}. Indexing in the background…` };
  });
}

export async function deleteDocumentAction(slug: string, id: string): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requireWs(slug, "docs:write");
    await deleteDocument(ctx, z.uuid().parse(id));
    revalidatePath(`/w/${slug}/documents`);
    return { status: "success", message: "Document deleted" };
  });
}

export async function retryDocumentAction(slug: string, id: string): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requireWs(slug, "docs:write");
    await retryDocument(ctx, z.uuid().parse(id));
    after(() => runJobs({ timeBudgetMs: 120_000 }));
    revalidatePath(`/w/${slug}/documents`);
    return { status: "success", message: "Queued for another try" };
  });
}

export async function deleteConversationAction(slug: string, id: string): Promise<FormState> {
  let ok = false;
  const state = await runAction(async () => {
    const ctx = await requireWs(slug, "chat:ask");
    await deleteConversation({ ws: ctx.ws, userId: ctx.user.id, source: "app" }, z.uuid().parse(id));
    ok = true;
  });
  if (!ok) return state;
  revalidatePath(`/w/${slug}/chat`, "layout");
  redirect(`/w/${slug}/chat`);
}

export async function addMemberAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requireWs(slug, "members:manage");
    await addMember(ctx, addMemberInput.parse(formObject(fd)));
    revalidatePath(`/w/${slug}/settings`);
    return { status: "success", message: "Member added" };
  });
}

export async function changeRoleAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requireWs(slug, "members:manage");
    const { memberId, role } = roleInput.parse(formObject(fd));
    await changeRole(ctx, memberId, role);
    revalidatePath(`/w/${slug}/settings`);
    return { status: "success", message: "Role updated" };
  });
}

export async function removeMemberAction(slug: string, memberId: string): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requireWs(slug, "members:manage");
    await removeMember(ctx, z.uuid().parse(memberId));
    revalidatePath(`/w/${slug}/settings`);
    return { status: "success", message: "Member removed" };
  });
}

export async function updateWidgetAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requireWs(slug, "widget:manage");
    const raw = formObject(fd);
    await updateWidget(
      ctx,
      widgetInput.parse({
        widgetEnabled: raw.widgetEnabled === "on",
        widgetGreeting: raw.widgetGreeting,
        widgetAllowedOrigins: (raw.widgetAllowedOrigins ?? "")
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    );
    revalidatePath(`/w/${slug}/settings`);
    return { status: "success", message: "Widget settings saved" };
  });
}

export async function rotateWidgetKeyAction(slug: string): Promise<FormState> {
  return runAction(async () => {
    await rotateWidgetKey(await requireWs(slug, "widget:manage"));
    revalidatePath(`/w/${slug}/settings`);
    return { status: "success", message: "New widget key generated; update your embed snippet" };
  });
}
