"use client";
import { Copy } from "lucide-react";
import { useActionState, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@portfolio/ui/button";
import { Checkbox } from "@portfolio/ui/checkbox";
import { Input } from "@portfolio/ui/input";
import { Label } from "@portfolio/ui/label";
import { Textarea } from "@portfolio/ui/textarea";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { useFormToast } from "@/components/use-form-toast";
import { idle } from "@/lib/form-state";
import { addMemberAction, changeRoleAction, updateWidgetAction } from "@/server/actions/workspace";

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function AddMemberForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(addMemberAction.bind(null, slug), idle);
  useFormToast(state);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1 space-y-1">
        <Label htmlFor="member-email">Email of an existing account</Label>
        <Input id="member-email" name="email" type="email" required aria-describedby="member-error" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="member-role">Role</Label>
        <select id="member-role" name="role" defaultValue="viewer" className={selectClass}>
          <option value="viewer">Viewer (ask questions)</option>
          <option value="editor">Editor (manage documents)</option>
          <option value="owner">Owner</option>
        </select>
      </div>
      <SubmitButton pendingText="Adding">Add member</SubmitButton>
      <div className="w-full">
        <FieldError id="member-error" errors={state.fieldErrors?.email} />
        {state.status === "error" && !state.fieldErrors ? <p className="text-sm text-destructive">{state.message}</p> : null}
      </div>
    </form>
  );
}

export function RoleSelect({ slug, memberId, role, label }: { slug: string; memberId: string; role: string; label: string }) {
  const [state, action] = useActionState(changeRoleAction.bind(null, slug), idle);
  const ref = useRef<HTMLFormElement>(null);
  useFormToast(state);
  return (
    <form ref={ref} action={action}>
      <input type="hidden" name="memberId" value={memberId} />
      <label htmlFor={`role-${memberId}`} className="sr-only">
        Role for {label}
      </label>
      <select id={`role-${memberId}`} name="role" defaultValue={role} className={selectClass} onChange={() => ref.current?.requestSubmit()}>
        <option value="owner">Owner</option>
        <option value="editor">Editor</option>
        <option value="viewer">Viewer</option>
      </select>
    </form>
  );
}

export function WidgetForm({ slug, enabled, greeting, origins, snippet }: { slug: string; enabled: boolean; greeting: string; origins: string[]; snippet: string }) {
  const [state, action] = useActionState(updateWidgetAction.bind(null, slug), idle);
  useFormToast(state);
  const originErrors = Object.entries(state.fieldErrors ?? {})
    .filter(([k]) => k.startsWith("widgetAllowedOrigins"))
    .flatMap(([, v]) => v ?? []);
  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        <div className="flex items-center gap-2">
          <Checkbox id="widgetEnabled" name="widgetEnabled" defaultChecked={enabled} />
          <Label htmlFor="widgetEnabled" className="font-normal">
            Enable the embeddable chat widget
          </Label>
        </div>
        <div className="space-y-1">
          <Label htmlFor="widgetGreeting">Greeting</Label>
          <Input id="widgetGreeting" name="widgetGreeting" defaultValue={greeting} maxLength={200} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="widgetAllowedOrigins">Allowed websites</Label>
          <Textarea id="widgetAllowedOrigins" name="widgetAllowedOrigins" defaultValue={origins.join("\n")} rows={3} placeholder={"https://www.example.com\nhttps://help.example.com"} aria-describedby="origins-hint origins-error" />
          <p id="origins-hint" className="text-xs text-muted-foreground">
            One origin per line. The widget only loads on these sites (checked against the page that embeds it).
          </p>
          <FieldError id="origins-error" errors={originErrors.length ? originErrors : undefined} />
        </div>
        <SubmitButton pendingText="Saving">Save widget settings</SubmitButton>
      </form>
      <div>
        <p className="mb-1 text-sm font-medium">Embed snippet</p>
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 pr-12 text-xs">
            <code>{snippet}</code>
          </pre>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            className="absolute top-2 right-2"
            aria-label="Copy embed snippet"
            onClick={() => navigator.clipboard.writeText(snippet).then(() => toast.success("Snippet copied"))}
          >
            <Copy className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
