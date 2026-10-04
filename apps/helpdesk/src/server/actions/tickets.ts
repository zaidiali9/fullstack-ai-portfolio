"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { FormState } from "@/lib/form-state";
import { formObject, runAction } from "../run-action";
import { runTriage } from "../ai/features";
import { enforceAiLimits } from "../ai/quota";
import { requireOrg } from "../authz";
import { deliverPending } from "../email";
import { createTicket, createTicketInput, getTicketByNumber, replyInput, replyToTicket, updateTicket, updateTicketInput } from "../tickets";

export async function createTicketAction(orgSlug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  let number = 0;
  const state = await runAction(async () => {
    const ctx = await requireOrg(orgSlug, "ticket:create");
    const input = createTicketInput.parse(formObject(fd));
    const { ticket, emailIds } = await createTicket(ctx, input);
    number = ticket.number;
    // Triage and email delivery run after the response so the customer is not kept waiting.
    after(async () => {
      await runTriage(ticket.id);
      await deliverPending(emailIds);
    });
  });
  if (state.status !== "success") return state;
  revalidatePath(`/o/${orgSlug}/tickets`);
  redirect(`/o/${orgSlug}/tickets/${number}?created=1`);
}

export async function replyAction(orgSlug: string, number: number, _prev: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requireOrg(orgSlug, "ticket:reply");
    const raw = formObject(fd);
    const input = replyInput.parse({
      body: raw.body,
      internal: raw.internal === "on" || raw.internal === "true",
      aiAssisted: raw.aiAssisted === "true",
    });
    const { emailIds } = await replyToTicket(ctx, number, input);
    after(() => deliverPending(emailIds));
    revalidatePath(`/o/${orgSlug}/tickets/${number}`);
    return { status: "success", message: input.internal ? "Internal note added" : "Reply sent" };
  });
}

export async function updateTicketAction(orgSlug: string, number: number, _prev: FormState, fd: FormData): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requireOrg(orgSlug, "ticket:update");
    const raw = formObject(fd);
    const patch = updateTicketInput.parse({
      status: raw.status || undefined,
      priority: raw.priority || undefined,
      category: raw.category || undefined,
      assigneeId: raw.assigneeId === undefined ? undefined : raw.assigneeId === "none" ? null : raw.assigneeId,
    });
    await updateTicket(ctx, number, patch);
    revalidatePath(`/o/${orgSlug}/tickets/${number}`);
    revalidatePath(`/o/${orgSlug}/tickets`);
    return { status: "success", message: "Ticket updated" };
  });
}

export async function retriageAction(orgSlug: string, number: number): Promise<FormState> {
  return runAction(async () => {
    const ctx = await requireOrg(orgSlug, "ai:use");
    await enforceAiLimits(ctx.user.id, ctx.org);
    const { ticket } = await getTicketByNumber(ctx, number);
    await runTriage(ticket.id, { actorId: ctx.user.id });
    revalidatePath(`/o/${orgSlug}/tickets/${number}`);
    return { status: "success", message: "Triage updated" };
  });
}
