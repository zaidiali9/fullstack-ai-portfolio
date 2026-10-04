"use client";
import { useActionState, useState } from "react";
import { Input } from "@portfolio/ui/input";
import { Label } from "@portfolio/ui/label";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { useFormToast } from "@/components/use-form-toast";
import { idle } from "@/lib/form-state";
import { createWorkspaceAction } from "@/server/actions/workspace";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export function OnboardingForm() {
  const [state, formAction] = useActionState(createWorkspaceAction, idle);
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  useFormToast(state);
  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Workspace name</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={80}
          placeholder="Acme Handbook"
          onChange={(e) => !touched && setSlug(slugify(e.target.value))}
          aria-invalid={!!state.fieldErrors?.name}
          aria-describedby="name-error"
        />
        <FieldError id="name-error" errors={state.fieldErrors?.name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">URL</Label>
        <div className="flex items-center rounded-lg border bg-muted/40 pl-3 text-sm text-muted-foreground focus-within:ring-3 focus-within:ring-ring/50">
          <span aria-hidden>/w/</span>
          <Input
            id="slug"
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              setTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            className="border-0 bg-transparent pl-1 shadow-none focus-visible:ring-0"
            aria-invalid={!!state.fieldErrors?.slug}
            aria-describedby="slug-error slug-hint"
          />
        </div>
        <p id="slug-hint" className="text-xs text-muted-foreground">
          Lowercase letters, numbers and dashes.
        </p>
        <FieldError id="slug-error" errors={state.fieldErrors?.slug} />
      </div>
      {state.status === "error" && !state.fieldErrors ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <SubmitButton className="h-9 w-full" pendingText="Creating">
        Create workspace
      </SubmitButton>
    </form>
  );
}
