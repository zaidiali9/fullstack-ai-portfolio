"use client";
import { useActionState } from "react";
import { Checkbox } from "@portfolio/ui/checkbox";
import { Input } from "@portfolio/ui/input";
import { Label } from "@portfolio/ui/label";
import { Textarea } from "@portfolio/ui/textarea";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { useFormToast } from "@/components/use-form-toast";
import { idle } from "@/lib/form-state";
import { saveArticleAction } from "@/server/actions/kb";

export function ArticleForm({ orgSlug, article }: { orgSlug: string; article?: { id: string; title: string; body: string; published: boolean } }) {
  const [state, formAction] = useActionState(saveArticleAction.bind(null, orgSlug, article?.id ?? null), idle);
  useFormToast(state);
  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required maxLength={160} defaultValue={article?.title} aria-invalid={!!state.fieldErrors?.title} aria-describedby="title-error" />
        <FieldError id="title-error" errors={state.fieldErrors?.title} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="body">Content (Markdown)</Label>
        <Textarea id="body" name="body" required rows={16} maxLength={20000} defaultValue={article?.body} className="font-mono text-sm" aria-invalid={!!state.fieldErrors?.body} aria-describedby="body-error body-hint" />
        <p id="body-hint" className="text-xs text-muted-foreground">
          Published articles are visible to customers and are used to ground AI reply drafts.
        </p>
        <FieldError id="body-error" errors={state.fieldErrors?.body} />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="published" name="published" defaultChecked={article?.published ?? true} />
        <Label htmlFor="published" className="font-normal">
          Published
        </Label>
      </div>
      {state.status === "error" && !state.fieldErrors ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <SubmitButton className="h-9 px-4" pendingText="Saving">
        {article ? "Save changes" : "Create article"}
      </SubmitButton>
    </form>
  );
}
