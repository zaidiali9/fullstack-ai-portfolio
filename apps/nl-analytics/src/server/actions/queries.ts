"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toErrorPayload } from "@portfolio/kit";
import type { FormState } from "@/lib/form-state";
import { requireAppUser } from "../access";
import {
  addTile,
  createDashboard,
  deleteDashboard,
  deleteQuery,
  moveTile,
  removeTile,
  saveQuery,
  setSharing,
  setTileWidth,
  updateDashboard,
  updateQuery,
} from "../queries";
import { formObject, runAction } from "../run-action";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

const isNextControlFlow = (err: unknown) => {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
};

async function result<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (isNextControlFlow(err)) throw err;
    return { ok: false, message: toErrorPayload(err).body.error.message };
  }
}

/** Save the current question/SQL/chart from the workspace. */
export async function saveQueryAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  return result(async () => {
    const user = await requireAppUser();
    const q = await saveQuery(user, payload);
    revalidatePath("/queries");
    return { id: q.id };
  });
}

export async function updateQueryAction(id: string, payload: unknown): Promise<ActionResult<{ id: string }>> {
  return result(async () => {
    const user = await requireAppUser();
    await updateQuery(user, id, payload);
    revalidatePath(`/queries/${id}`);
    revalidatePath("/queries");
    revalidatePath("/dashboards", "layout");
    return { id };
  });
}

export async function deleteQueryAction(id: string): Promise<FormState> {
  const res = await runAction(async () => {
    const user = await requireAppUser();
    await deleteQuery(user, id);
  });
  if (res.status === "error") return res;
  revalidatePath("/queries");
  redirect("/queries?deleted=1");
}

export async function createDashboardAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let id = "";
  const res = await runAction(async () => {
    const user = await requireAppUser();
    id = (await createDashboard(user, formObject(fd))).id;
  });
  if (res.status === "error") return res;
  revalidatePath("/dashboards");
  redirect(`/dashboards/${id}`);
}

export async function updateDashboardAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const user = await requireAppUser();
    await updateDashboard(user, id, formObject(fd));
    revalidatePath(`/dashboards/${id}`);
    return { status: "success", message: "Dashboard updated." };
  });
}

export async function deleteDashboardAction(id: string): Promise<FormState> {
  const res = await runAction(async () => {
    const user = await requireAppUser();
    await deleteDashboard(user, id);
  });
  if (res.status === "error") return res;
  revalidatePath("/dashboards");
  redirect("/dashboards?deleted=1");
}

export async function shareAction(id: string, enabled: boolean): Promise<FormState> {
  return runAction(async () => {
    const user = await requireAppUser();
    await setSharing(user, id, enabled);
    revalidatePath(`/dashboards/${id}`);
    return { status: "success", message: enabled ? "Public link created." : "Public link turned off. The old link no longer works." };
  });
}

export async function addTileAction(dashboardId: string, queryId: string): Promise<FormState> {
  return runAction(async () => {
    const user = await requireAppUser();
    await addTile(user, { dashboardId, queryId });
    revalidatePath(`/dashboards/${dashboardId}`);
    revalidatePath(`/queries/${queryId}`);
    return { status: "success", message: "Added to the dashboard." };
  });
}

export async function removeTileAction(dashboardId: string, queryId: string): Promise<FormState> {
  return runAction(async () => {
    const user = await requireAppUser();
    await removeTile(user, dashboardId, queryId);
    revalidatePath(`/dashboards/${dashboardId}`);
    return { status: "success", message: "Removed from the dashboard." };
  });
}

export async function moveTileAction(dashboardId: string, queryId: string, direction: -1 | 1): Promise<FormState> {
  return runAction(async () => {
    const user = await requireAppUser();
    await moveTile(user, dashboardId, queryId, direction === -1 ? -1 : 1);
    revalidatePath(`/dashboards/${dashboardId}`);
  });
}

export async function tileWidthAction(dashboardId: string, queryId: string, width: 1 | 2): Promise<FormState> {
  return runAction(async () => {
    const user = await requireAppUser();
    await setTileWidth(user, dashboardId, queryId, width === 2 ? 2 : 1);
    revalidatePath(`/dashboards/${dashboardId}`);
  });
}
