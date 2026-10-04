/** Yield the `data:` payloads of a Server-Sent Events response body. */
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const line of readLines(body)) {
    if (line.startsWith("data:")) yield line.slice(5).trimStart();
  }
}

/** Yield newline-delimited lines (used for SSE and Ollama's NDJSON). */
export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, "");
        buffer = buffer.slice(idx + 1);
        if (line.length > 0) yield line;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim().length > 0) yield buffer.trim();
  } finally {
    reader.releaseLock();
  }
}
