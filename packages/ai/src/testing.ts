import type { ChatProvider, EmbeddingProvider, GenerateRequest } from "./types";

/**
 * STUB provider for automated tests only. It never pretends to be a real model: its name is
 * "stub" and tests using it must say so in their title (hard rule: no fake AI output).
 */
export function createStubChatProvider(respond: (req: GenerateRequest) => string | Promise<string>): ChatProvider {
  return {
    name: "stub",
    model: "stub-model",
    async generate(req) {
      const text = await respond(req);
      return { text, usage: { inputTokens: 0, outputTokens: 0 } };
    },
    async *stream(req) {
      const text = await respond(req);
      for (const part of text.match(/.{1,12}/gs) ?? []) yield { type: "text", text: part };
      yield { type: "usage", usage: { inputTokens: 0, outputTokens: 0 } };
    },
  };
}

/** Deterministic bag-of-words embedding stub (384 dims) for tests that need vectors. */
export function createStubEmbeddingProvider(): EmbeddingProvider {
  return {
    name: "stub",
    model: "stub-embedding",
    dimensions: 384,
    async embed(texts) {
      return texts.map((t) => {
        const v = new Array<number>(384).fill(0);
        for (const word of t.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
          let h = 0;
          for (const c of word) h = (h * 31 + c.charCodeAt(0)) >>> 0;
          v[h % 384]! += 1;
        }
        const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
        return v.map((x) => x / norm);
      });
    },
  };
}
