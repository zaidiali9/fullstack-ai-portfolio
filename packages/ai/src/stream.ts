/**
 * Tiny text-streaming protocol shared by route handlers and browser code (no Node imports here).
 * Body = plain UTF-8 text fragments. If the model fails mid-stream, the server appends
 * ERROR_MARKER + JSON {code,message}; clients strip it and show the message.
 */
import { AIError } from "./errors";

export const ERROR_MARKER = "\u0000AI_ERROR:";
/** Optional JSON trailer sent after the text (e.g. citations computed once the answer is complete). */
export const META_MARKER = "\u0000AI_META:";

export interface StreamFailure {
  code: string;
  message: string;
}

/**
 * Turn a text generator into a streaming Response. Waits for the first fragment so that
 * failures before any output (AI unavailable, rate limited, timeout) still produce a proper
 * HTTP status via `onEarlyError`.
 */
export async function streamResponse(
  gen: AsyncGenerator<string, unknown>,
  opts: {
    onEarlyError: (err: unknown) => Response;
    headers?: HeadersInit;
    onComplete?: (text: string) => void | Promise<void>;
    /** Build a JSON trailer from the generator's return value; sent after the text if not undefined. */
    trailer?: (returnValue: unknown) => unknown;
  },
): Promise<Response> {
  let first: IteratorResult<string, unknown>;
  try {
    first = await gen.next();
  } catch (err) {
    return opts.onEarlyError(err);
  }
  const encoder = new TextEncoder();
  let full = "";
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let last: IteratorResult<string, unknown> = first;
        if (!first.done) {
          full += first.value;
          controller.enqueue(encoder.encode(first.value));
          for (last = await gen.next(); !last.done; last = await gen.next()) {
            full += last.value;
            controller.enqueue(encoder.encode(last.value));
          }
        }
        await opts.onComplete?.(full);
        const meta = opts.trailer?.(last.value);
        if (meta !== undefined) controller.enqueue(encoder.encode(META_MARKER + JSON.stringify(meta)));
      } catch (err) {
        const failure: StreamFailure =
          err instanceof AIError
            ? { code: err.code, message: err.message }
            : { code: "internal_error", message: "The answer was interrupted. Please try again." };
        if (!(err instanceof AIError)) console.error("[ai] stream failed", err);
        controller.enqueue(encoder.encode(ERROR_MARKER + JSON.stringify(failure)));
      } finally {
        controller.close();
      }
    },
    async cancel() {
      await gen.return(undefined);
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...Object.fromEntries(new Headers(opts.headers ?? {})),
    },
  });
}

/**
 * Browser/Node reader for streamResponse bodies. Resolves with the full text or rejects with
 * StreamFailure. A metadata trailer (if any) is passed to `onMeta` and never shown as text.
 */
export async function readTextStream(res: Response, onText: (fullTextSoFar: string) => void, onMeta?: (meta: unknown) => void): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    const idx = text.indexOf(ERROR_MARKER);
    if (idx >= 0) {
      const visible = text.slice(0, idx);
      onText(visible);
      let failure: StreamFailure = { code: "internal_error", message: "The answer was interrupted." };
      try {
        failure = JSON.parse(text.slice(idx + ERROR_MARKER.length) + decoder.decode()) as StreamFailure;
      } catch {
        /* keep default */
      }
      throw Object.assign(new Error(failure.message), { code: failure.code, partial: visible });
    }
    const metaAt = text.indexOf(META_MARKER);
    onText(metaAt >= 0 ? text.slice(0, metaAt) : text);
  }
  text += decoder.decode();
  const metaAt = text.indexOf(META_MARKER);
  if (metaAt >= 0) {
    try {
      onMeta?.(JSON.parse(text.slice(metaAt + META_MARKER.length)));
    } catch {
      /* ignore a malformed trailer */
    }
    return text.slice(0, metaAt);
  }
  return text;
}
