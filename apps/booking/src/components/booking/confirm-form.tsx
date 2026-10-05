"use client";
import { TimerReset } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { buttonVariants } from "@portfolio/ui/button";
import { Label } from "@portfolio/ui/label";
import { Textarea } from "@portfolio/ui/textarea";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { useFormToast } from "@/components/use-form-toast";
import { idle } from "@/lib/form-state";
import { confirmAction } from "@/server/actions/bookings";

function useSecondsLeft(expiresAt: string) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, []);
  return now === null ? null : Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
}

export function ConfirmForm({ bookingId, expiresAt, backHref }: { bookingId: string; expiresAt: string; backHref: string }) {
  const [state, formAction] = useActionState(confirmAction.bind(null, bookingId), idle);
  useFormToast(state);
  const left = useSecondsLeft(expiresAt);
  const expired = left === 0;
  return (
    <form action={formAction} className="space-y-4">
      <p
        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${expired ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}
        role="timer"
        aria-live={left !== null && left <= 30 ? "polite" : "off"}
      >
        <TimerReset className="size-4 shrink-0" aria-hidden />
        {left === null
          ? "This time is held for you."
          : expired
            ? "Your hold expired. The time may still be free — go back and pick it again."
            : `Held for you for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} more.`}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="notes">Anything we should know? (optional)</Label>
        <Textarea id="notes" name="notes" maxLength={500} rows={3} placeholder="e.g. focus on shoulders, sensitive skin…" aria-describedby="notes-help" />
        <p id="notes-help" className="text-xs text-muted-foreground">
          Visible to the studio team. Don&apos;t include medical details you wouldn&apos;t share at the front desk.
        </p>
        <FieldError id="notes-error" errors={state.fieldErrors?.notes} />
      </div>
      {state.status === "error" && !state.fieldErrors ? <p className="text-sm text-destructive">{state.message}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={backHref} className={buttonVariants({ variant: "outline" })}>
          Pick another time
        </Link>
        <SubmitButton disabled={expired} pendingText="Confirming…">
          Confirm booking
        </SubmitButton>
      </div>
    </form>
  );
}
