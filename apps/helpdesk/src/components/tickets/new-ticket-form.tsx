"use client";
import { useActionState } from "react";
import { Input } from "@portfolio/ui/input";
import { Label } from "@portfolio/ui/label";
import { Textarea } from "@portfolio/ui/textarea";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { useFormToast } from "@/components/use-form-toast";
import { idle } from "@/lib/form-state";
import { createTicketAction } from "@/server/actions/tickets";

export function NewTicketForm({ orgSlug }: { orgSlug: string }) {
  const [state, formAction] = useActionState(createTicketAction.bind(null, orgSlug), idle);
  useFormToast(state);
  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" name="subject" required minLength={5} maxLength={160} placeholder="e.g. I was charged twice for March" aria-invalid={!!state.fieldErrors?.subject} aria-describedby="subject-error" />
        <FieldError id="subject-error" errors={state.fieldErrors?.subject} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="body">Describe the issue</Label>
        <Textarea
          id="body"
          name="body"
          required
          minLength={10}
          maxLength={10000}
          rows={8}
          placeholder="What happened, what you expected, and any error messages or order numbers."
          aria-invalid={!!state.fieldErrors?.body}
          aria-describedby="body-error body-hint"
        />
        <p id="body-hint" className="text-xs text-muted-foreground">
          Please don&apos;t include passwords or card numbers.
        </p>
        <FieldError id="body-error" errors={state.fieldErrors?.body} />
      </div>
      {state.status === "error" && !state.fieldErrors ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <SubmitButton className="h-9 px-4" pendingText="Submitting">
        Submit ticket
      </SubmitButton>
    </form>
  );
}
