import "server-only";
import { toErrorPayload } from "@portfolio/kit";
import type { FormState } from "@/lib/form-state";

const isNextControlFlow = (err: unknown) => {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
};

/** Run a server action body; convert thrown errors to a safe FormState (redirects pass through). */
export async function runAction(fn: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await fn()) ?? { status: "success" };
  } catch (err) {
    if (isNextControlFlow(err)) throw err;
    const { body } = toErrorPayload(err);
    return {
      status: "error",
      message: body.error.message,
      fieldErrors: body.error.code === "validation_error" ? (body.error.issues as FormState["fieldErrors"]) : undefined,
    };
  }
}

export const formObject = (fd: FormData) =>
  Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
