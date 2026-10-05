"use client";
import { useActionState } from "react";
import { Input } from "@portfolio/ui/input";
import { Label } from "@portfolio/ui/label";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { useFormToast } from "@/components/use-form-toast";
import { idle } from "@/lib/form-state";
import { createDashboardAction } from "@/server/actions/queries";

export function CreateDashboardForm() {
  const [state, action] = useActionState(createDashboardAction, idle);
  useFormToast(state);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="dash-title">New dashboard</Label>
        <Input id="dash-title" name="title" required maxLength={100} placeholder="e.g. Weekly sales review" aria-describedby={state.fieldErrors?.title ? "dash-title-error" : undefined} />
        <FieldError id="dash-title-error" errors={state.fieldErrors?.title} />
      </div>
      <SubmitButton pendingText="Creating…">Create</SubmitButton>
    </form>
  );
}
