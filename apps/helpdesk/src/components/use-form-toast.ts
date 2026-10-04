"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { FormState } from "@/lib/form-state";

/** Show a toast whenever a server action returns a new success/error state. */
export function useFormToast(state: FormState, opts: { onSuccess?: () => void } = {}) {
  const last = useRef(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state.status === "success" && state.message) {
      toast.success(state.message);
      opts.onSuccess?.();
    } else if (state.status === "error" && state.message && !state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state, opts]);
}
