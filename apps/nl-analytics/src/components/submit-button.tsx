"use client";
import { useFormStatus } from "react-dom";
import { Button } from "@portfolio/ui/button";
import { Spinner } from "@portfolio/ui/spinner";
import type { ComponentProps } from "react";

export function SubmitButton({ children, pendingText, ...props }: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? <Spinner label={pendingText ?? "Working"} /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
