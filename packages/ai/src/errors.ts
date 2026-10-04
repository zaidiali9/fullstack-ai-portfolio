export type AIErrorCode =
  | "unavailable"
  | "timeout"
  | "rate_limited"
  | "provider_error"
  | "invalid_output"
  | "input_too_long"
  | "aborted";

const RETRYABLE: ReadonlySet<AIErrorCode> = new Set(["timeout", "rate_limited", "provider_error"]);

/** Error type for every failure in the AI layer. `message` is safe to show to end users. */
export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly retryable: boolean;
  /** Internal detail for server logs only; never send to clients. */
  readonly detail?: string;

  constructor(code: AIErrorCode, message: string, opts: { retryable?: boolean; detail?: string; cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = "AIError";
    this.code = code;
    this.retryable = opts.retryable ?? RETRYABLE.has(code);
    this.detail = opts.detail;
  }
}

export const aiUnavailable = () =>
  new AIError("unavailable", "AI unavailable: no AI provider is configured on this server.", { retryable: false });

/** Map an HTTP status from a provider API to an AIError. */
export function httpError(provider: string, status: number, body: string): AIError {
  const detail = `${provider} HTTP ${status}: ${body.slice(0, 500)}`;
  if (status === 429) return new AIError("rate_limited", "The AI provider is busy. Please try again shortly.", { detail });
  if (status === 408 || status >= 500) return new AIError("provider_error", "The AI provider had a temporary problem.", { detail });
  if (status === 401 || status === 403)
    return new AIError("unavailable", "AI unavailable: the provider rejected the server's credentials.", { retryable: false, detail });
  return new AIError("provider_error", "The AI provider rejected the request.", { retryable: false, detail });
}

/** Normalize anything thrown by fetch/providers into an AIError. */
export function toAIError(err: unknown, signal?: AbortSignal): AIError {
  if (err instanceof AIError) return err;
  const name = (err as { name?: string } | null)?.name;
  if (name === "TimeoutError" || (signal?.aborted && signal.reason?.name === "TimeoutError")) {
    return new AIError("timeout", "The AI request timed out.", { cause: err });
  }
  if (name === "AbortError" || signal?.aborted) {
    return new AIError("aborted", "The AI request was cancelled.", { retryable: false, cause: err });
  }
  const msg = err instanceof Error ? err.message : String(err);
  return new AIError("provider_error", "The AI provider had a temporary problem.", { detail: msg, cause: err });
}
