"use client";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@portfolio/ui/button";
import { Spinner } from "@portfolio/ui/spinner";
import type { FormState } from "@/lib/form-state";
import type { ComponentProps } from "react";

/**
 * Button that calls a bound server action (optionally after a confirm()) and toasts the result.
 * Redirects thrown by the action are followed by Next.js automatically.
 */
export function ActionButton({
  action,
  confirm: confirmText,
  children,
  ...props
}: { action: () => Promise<FormState>; confirm?: string; children: ReactNode } & Omit<ComponentProps<typeof Button>, "onClick" | "action">) {
  const [pending, start] = useTransition();
  return (
    <Button
      {...props}
      disabled={pending || props.disabled}
      aria-busy={pending}
      onClick={() => {
        if (confirmText && !window.confirm(confirmText)) return;
        start(async () => {
          const res = await action();
          if (res?.status === "error") toast.error(res.message ?? "Something went wrong");
          else if (res?.status === "success" && res.message) toast.success(res.message);
        });
      }}
    >
      {pending ? <Spinner /> : null}
      {children}
    </Button>
  );
}
