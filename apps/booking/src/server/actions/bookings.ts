"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toErrorPayload } from "@portfolio/kit";
import type { FormState } from "@/lib/form-state";
import { currentUser, isTeam, requireCustomer, requireTeam } from "../access";
import { cancelBooking, confirmBooking, holdSlot, markNotificationsRead, rescheduleBooking, setOutcome, type Alternative } from "../bookings";
import { formObject, runAction } from "../run-action";

export type SlotResult = { ok: true; bookingId: string } | { ok: false; message: string; signIn?: boolean; alternatives?: Alternative[] };

const isNextControlFlow = (err: unknown) => {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
};

/** Slot-picking actions return alternatives on conflict so the UI can offer them inline. */
async function slotResult(fn: () => Promise<string>): Promise<SlotResult> {
  try {
    return { ok: true, bookingId: await fn() };
  } catch (err) {
    if (isNextControlFlow(err)) throw err;
    const { body } = toErrorPayload(err);
    const alternatives = body.error.code === "conflict" ? (body.error.issues as { alternatives?: Alternative[] } | undefined)?.alternatives : undefined;
    return { ok: false, message: body.error.message, alternatives };
  }
}

export async function holdAction(input: { serviceId: string; staffId: string; start: string }): Promise<SlotResult> {
  const user = await currentUser();
  if (!user) return { ok: false, signIn: true, message: "Please sign in to book." };
  return slotResult(async () => (await holdSlot(user, input)).id);
}

export async function rescheduleAction(input: { bookingId: string; version: number; staffId: string; start: string }): Promise<SlotResult> {
  const user = await currentUser();
  if (!user) return { ok: false, signIn: true, message: "Please sign in to continue." };
  const res = await slotResult(async () => (await rescheduleBooking(user, input)).id);
  if (res.ok) {
    revalidatePath("/my");
    revalidatePath("/dashboard");
  }
  return res;
}

export async function confirmAction(bookingId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const res = await runAction(async () => {
    const user = await requireCustomer();
    await confirmBooking(user, { bookingId, notes: formObject(fd).notes ?? "" });
  });
  if (res.status === "error") return res;
  revalidatePath("/my");
  redirect(`/my/${bookingId}?booked=1`);
}

export async function cancelAction(bookingId: string, version: number): Promise<FormState> {
  return runAction(async () => {
    const user = await requireCustomer();
    await cancelBooking(user, { bookingId, version });
    revalidatePath(isTeam(user) ? "/dashboard" : "/my");
    revalidatePath(`/my/${bookingId}`);
    revalidatePath(`/dashboard/bookings/${bookingId}`);
    return { status: "success", message: "Booking cancelled." };
  });
}

export async function outcomeAction(bookingId: string, version: number, status: "completed" | "no_show"): Promise<FormState> {
  return runAction(async () => {
    const user = await requireTeam();
    await setOutcome(user, { bookingId, version, status });
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/bookings/${bookingId}`);
    return { status: "success", message: status === "completed" ? "Marked as completed." : "Marked as a no-show." };
  });
}

export async function markReadAction(): Promise<FormState> {
  return runAction(async () => {
    const user = await requireCustomer();
    await markNotificationsRead(user);
    revalidatePath("/", "layout");
    return { status: "success", message: "All caught up." };
  });
}
