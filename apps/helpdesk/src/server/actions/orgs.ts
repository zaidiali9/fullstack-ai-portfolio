"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { FormState } from "@/lib/form-state";
import { formObject, runAction } from "../run-action";
import { requireOrg } from "../authz";
import { deliverPending } from "../email";
import {
  acceptInvite,
  changeRole,
  createOrg,
  createOrgInput,
  inviteInput,
  inviteMember,
  joinAsCustomer,
  removeMember,
  roleInput,
  settingsInput,
  slugSchema,
  updateSettings,
} from "../orgs";
import { requireUser } from "../session";

export async function createOrgAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let slug = "";
  const state = await runAction(async () => {
    const user = await requireUser();
    const org = await createOrg(user, createOrgInput.parse(formObject(fd)));
    slug = org.slug;
  });
  if (state.status !== "success") return state;
  redirect(`/o/${slug}/tickets`);
}

export async function joinOrgAction(slug: string): Promise<FormState> {
  const state = await runAction(async () => {
    const user = await requireUser();
    await joinAsCustomer(user, slugSchema.parse(slug));
  });
  if (state.status !== "success") return state;
  redirect(`/o/${slug}/tickets`);
}

export async function acceptInviteAction(token: string): Promise<FormState> {
  let slug = "";
  const state = await runAction(async () => {
    const user = await requireUser();
    slug = await acceptInvite(user, token);
  });
  if (state.status !== "success") return state;
  redirect(`/o/${slug}/tickets`);
}

export async function inviteAction(orgSlug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requireOrg(orgSlug, "members:manage");
    const { link, emailIds } = await inviteMember(ctx, inviteInput.parse(formObject(fd)));
    after(() => deliverPending(emailIds));
    revalidatePath(`/o/${orgSlug}/settings/members`);
    return { status: "success", message: "Invitation created", data: { link } };
  });
}

export async function changeRoleAction(orgSlug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requireOrg(orgSlug, "members:manage");
    const { membershipId, role } = roleInput.parse(formObject(fd));
    await changeRole(ctx, membershipId, role);
    revalidatePath(`/o/${orgSlug}/settings/members`);
    return { status: "success", message: "Role updated" };
  });
}

export async function removeMemberAction(orgSlug: string, membershipId: string): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requireOrg(orgSlug, "members:manage");
    await removeMember(ctx, roleInput.shape.membershipId.parse(membershipId));
    revalidatePath(`/o/${orgSlug}/settings/members`);
    return { status: "success", message: "Member removed" };
  });
}

export async function updateSettingsAction(orgSlug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requireOrg(orgSlug, "org:settings");
    const raw = formObject(fd);
    await updateSettings(ctx, settingsInput.parse({ name: raw.name, allowCustomerSignup: raw.allowCustomerSignup === "on" }));
    revalidatePath(`/o/${orgSlug}`, "layout");
    return { status: "success", message: "Settings saved" };
  });
}
