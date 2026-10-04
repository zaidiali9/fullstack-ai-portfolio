/**
 * Tiny text-streaming protocol shared by route handlers and browser code (no Node imports here).
 * Body = plain UTF-8 text fragments. If the model fails mid-stream, the server appends
 * ERROR_MARKER + JSON {code,message}; clients strip it and show the message.
 */
import { AIError } from "./errors";

export const ERROR_MARKER = "\u0000AI_ERROR:";

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
  opts: { onEarlyError: (err: unknown) => Response; headers?: HeadersInit; onComplete?: (text: string) => void | Promise<void> },
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
        if (!first.done) {
          full += first.value;
          controller.enqueue(encoder.encode(first.value));
          for (let r = await gen.next(); !r.done; r = await gen.next()) {
            full += r.value;
            controller.enqueue(encoder.encode(r.value));
          }
        }
        await opts.onComplete?.(full);
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

/** Browser/Node reader for streamResponse bodies. Resolves with the full text or rejects with StreamFailure. */
export async function readTextStream(res: Response, onText: (fullTextSoFar: string) => void): Promise<string> {
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
    onText(text);
  }
  return text;
}
