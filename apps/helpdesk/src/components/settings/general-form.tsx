"use client";
import { useActionState } from "react";
import { Checkbox } from "@portfolio/ui/checkbox";
import { Input } from "@portfolio/ui/input";
import { Label } from "@portfolio/ui/label";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { useFormToast } from "@/components/use-form-toast";
import { idle } from "@/lib/form-state";
import { updateSettingsAction } from "@/server/actions/orgs";

export function GeneralForm({ orgSlug, name, allowCustomerSignup, portalUrl }: { orgSlug: string; name: string; allowCustomerSignup: boolean; portalUrl: string }) {
  const [state, formAction] = useActionState(updateSettingsAction.bind(null, orgSlug), idle);
  useFormToast(state);
  return (
    <form action={formAction} className="max-w-xl space-y-5 rounded-xl border bg-card p-5">
      <div className="space-y-2">
        <Label htmlFor="name">Organization name</Label>
        <Input id="name" name="name" defaultValue={name} required maxLength={80} aria-describedby="name-error" />
        <FieldError id="name-error" errors={state.fieldErrors?.name} />
      </div>
      <div className="flex items-start gap-2">
        <Checkbox id="allowCustomerSignup" name="allowCustomerSignup" defaultChecked={allowCustomerSignup} className="mt-0.5" aria-describedby="portal-hint" />
        <div>
          <Label htmlFor="allowCustomerSignup" className="font-normal">
            Public support portal
          </Label>
          <p id="portal-hint" className="mt-1 text-xs text-muted-foreground">
            Anyone with an account can join as a customer at <code className="rounded bg-muted px-1">{portalUrl}</code>
          </p>
        </div>
      </div>
      <SubmitButton pendingText="Saving">Save</SubmitButton>
    </form>
  );
}
