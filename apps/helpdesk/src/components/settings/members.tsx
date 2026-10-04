"use client";
import { Copy } from "lucide-react";
import { useActionState, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@portfolio/ui/button";
import { Input } from "@portfolio/ui/input";
import { Label } from "@portfolio/ui/label";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { useFormToast } from "@/components/use-form-toast";
import { idle } from "@/lib/form-state";
import { changeRoleAction, inviteAction } from "@/server/actions/orgs";

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function InviteForm({ orgSlug }: { orgSlug: string }) {
  const [state, formAction] = useActionState(inviteAction.bind(null, orgSlug), idle);
  useFormToast(state);
  const link = state.status === "success" ? state.data?.link : undefined;
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Invite someone</h2>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" name="email" type="email" required aria-describedby="invite-error" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="invite-role">Role</Label>
          <select id="invite-role" name="role" defaultValue="agent" className={selectClass}>
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
            <option value="customer">Customer</option>
          </select>
        </div>
        <SubmitButton pendingText="Inviting">Send invite</SubmitButton>
      </form>
      <FieldError id="invite-error" errors={state.fieldErrors?.email} />
      {link ? (
        <div className="mt-3 rounded-md bg-muted p-3 text-sm">
          <p className="text-muted-foreground">Invitation email queued (see Emails). You can also share this link — it is shown once:</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">{link}</code>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Copy invite link"
              onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link copied"))}
            >
              <Copy className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RoleSelect({ orgSlug, membershipId, role, label }: { orgSlug: string; membershipId: string; role: string; label: string }) {
  const [state, formAction] = useActionState(changeRoleAction.bind(null, orgSlug), idle);
  const ref = useRef<HTMLFormElement>(null);
  useFormToast(state);
  return (
    <form ref={ref} action={formAction}>
      <input type="hidden" name="membershipId" value={membershipId} />
      <label htmlFor={`role-${membershipId}`} className="sr-only">
        Role for {label}
      </label>
      <select id={`role-${membershipId}`} name="role" defaultValue={role} className={selectClass} onChange={() => ref.current?.requestSubmit()}>
        <option value="admin">Admin</option>
        <option value="agent">Agent</option>
        <option value="customer">Customer</option>
      </select>
    </form>
  );
}
