import { AIError } from "@portfolio/ai";
import { ZodError, z } from "zod";

/** An error whose status, code and message are safe to send to the client. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;
  constructor(status: number, code: string, message: string, opts: { details?: unknown; headers?: Record<string, string> } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = opts.details;
    this.headers = opts.headers;
  }
}

export const unauthorized = () => new HttpError(401, "unauthorized", "Please sign in to continue.");
export const forbidden = (msg = "You don't have permission to do that.") => new HttpError(403, "forbidden", msg);
export const notFound = (what = "Resource") => new HttpError(404, "not_found", `${what} not found.`);
export const conflict = (msg: string, details?: unknown) => new HttpError(409, "conflict", msg, { details });

const AI_STATUS: Record<string, number> = {
  unavailable: 503,
  timeout: 504,
  rate_limited: 429,
  provider_error: 502,
  invalid_output: 502,
  input_too_long: 413,
  aborted: 499,
};

export interface ErrorBody {
  error: { code: string; message: string; issues?: unknown; requestId?: string };
}

/**
 * Convert any thrown value into a safe { status, body }. Unknown errors are logged server-side
 * with a request id and the client gets a generic message — never a stack trace.
 */
export function toErrorPayload(err: unknown): { status: number; body: ErrorBody; headers?: Record<string, string> } {
  if (err instanceof HttpError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message, issues: err.details } }, headers: err.headers };
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      body: { error: { code: "validation_error", message: "Some fields are invalid.", issues: z.flattenError(err).fieldErrors } },
    };
  }
  if (err instanceof AIError) {
    if (err.detail) console.warn(`[ai] ${err.code}: ${err.detail}`);
    return { status: AI_STATUS[err.code] ?? 502, body: { error: { code: `ai_${err.code}`, message: err.message } } };
  }
  const requestId = crypto.randomUUID().slice(0, 8);
  console.error(`[error ${requestId}]`, err);
  return { status: 500, body: { error: { code: "internal_error", message: "Something went wrong on our side.", requestId } } };
}

export function errorResponse(err: unknown): Response {
  const { status, body, headers } = toErrorPayload(err);
  return Response.json(body, { status, headers });
}

/** Wrap a route handler so every thrown error becomes a safe JSON response. */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Result type for server actions (actions can't return Response objects). */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ErrorBody["error"] };

export async function action<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    // Next.js uses thrown errors for redirect()/notFound(); let those through.
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))) throw err;
    return { ok: false, error: toErrorPayload(err).body.error };
  }
}

/**
 * CSRF defense for cookie-authenticated route handlers (server actions get Next's built-in check).
 * Browsers always send Origin on cross-site POSTs; reject when it doesn't match this host.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new HttpError(403, "csrf", "Cross-site request blocked.");
    }
    if (originHost !== host) throw new HttpError(403, "csrf", "Cross-site request blocked.");
    return;
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "csrf", "Cross-site request blocked.");
}
