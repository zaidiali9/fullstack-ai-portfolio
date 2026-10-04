import { describe, expect, it } from "vitest";
import { resolveChatProvider, resolveEmbeddingProvider } from "../src/config";
import { createGeminiProvider } from "../src/providers/gemini";
import { createHFEmbeddingProvider } from "../src/providers/huggingface";
import { createOllamaProvider } from "../src/providers/ollama";
import { createOpenAICompatibleProvider } from "../src/providers/openai-compatible";
import type { StreamChunk } from "../src/types";

// These tests use a MOCKED fetch: they verify request/response handling, not live provider calls.

const sse = (events: string[]) =>
  new Response(new ReadableStream({
    start(c) {
      const enc = new TextEncoder();
      // split across chunk boundaries on purpose
      const raw = events.map((e) => `data: ${e}\n\n`).join("");
      c.enqueue(enc.encode(raw.slice(0, 17)));
      c.enqueue(enc.encode(raw.slice(17)));
      c.close();
    },
  }));

const collect = async (it: AsyncIterable<StreamChunk>) => {
  const out: StreamChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
};

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("OpenAI-compatible provider (mocked fetch)", () => {
  it("sends a chat-completions request and parses the reply", async () => {
    const m = mockFetch(() => Response.json({ choices: [{ message: { content: "hi" } }], usage: { prompt_tokens: 5, completion_tokens: 1 } }));
    const p = createOpenAICompatibleProvider({ name: "groq", baseUrl: "https://x/v1/", apiKey: "k", model: "m", supportsJsonMode: true, fetchImpl: m.fn });
    const r = await p.generate({ messages: [{ role: "user", content: "q" }], maxOutputTokens: 10, json: true });
    expect(r).toEqual({ text: "hi", usage: { inputTokens: 5, outputTokens: 1 } });
    expect(m.calls[0]!.url).toBe("https://x/v1/chat/completions");
    expect(m.calls[0]!.headers.authorization).toBe("Bearer k");
    expect(m.calls[0]!.body).toMatchObject({ model: "m", max_tokens: 10, response_format: { type: "json_object" } });
  });

  it("parses SSE streams split across chunks", async () => {
    const m = mockFetch(() =>
      sse([
        JSON.stringify({ choices: [{ delta: { content: "Hel" } }] }),
        JSON.stringify({ choices: [{ delta: { content: "lo" } }] }),
        JSON.stringify({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 2 } }),
        "[DONE]",
      ]),
    );
    const p = createOpenAICompatibleProvider({ name: "openai", baseUrl: "https://x/v1", apiKey: "k", model: "m", fetchImpl: m.fn });
    const chunks = await collect(p.stream({ messages: [], maxOutputTokens: 5 }));
    expect(chunks).toEqual([
      { type: "text", text: "Hel" },
      { type: "text", text: "lo" },
      { type: "usage", usage: { inputTokens: 2, outputTokens: 2 } },
    ]);
  });

  it("maps HTTP 429 to a retryable rate_limited error and 401 to unavailable", async () => {
    const r429 = createOpenAICompatibleProvider({ name: "groq", baseUrl: "https://x", apiKey: "k", model: "m", fetchImpl: mockFetch(() => new Response("slow down", { status: 429 })).fn });
    await expect(r429.generate({ messages: [], maxOutputTokens: 1 })).rejects.toMatchObject({ code: "rate_limited", retryable: true });
    const r401 = createOpenAICompatibleProvider({ name: "groq", baseUrl: "https://x", apiKey: "k", model: "m", fetchImpl: mockFetch(() => new Response("no", { status: 401 })).fn });
    await expect(r401.generate({ messages: [], maxOutputTokens: 1 })).rejects.toMatchObject({ code: "unavailable", retryable: false });
  });
});

describe("Gemini provider (mocked fetch)", () => {
  it("maps system prompt and roles", async () => {
    const m = mockFetch(() => Response.json({ candidates: [{ content: { parts: [{ text: "ok" }] } }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 1 } }));
    const p = createGeminiProvider({ apiKey: "g", model: "gemini-x", fetchImpl: m.fn });
    const r = await p.generate({
      messages: [{ role: "system", content: "sys" }, { role: "user", content: "u" }, { role: "assistant", content: "a" }],
      maxOutputTokens: 7,
      json: true,
    });
    expect(r.text).toBe("ok");
    expect(m.calls[0]!.url).toContain("/models/gemini-x:generateContent");
    expect(m.calls[0]!.headers["x-goog-api-key"]).toBe("g");
    expect(m.calls[0]!.body).toMatchObject({
      systemInstruction: { parts: [{ text: "sys" }] },
      contents: [{ role: "user" }, { role: "model" }],
      generationConfig: { maxOutputTokens: 7, responseMimeType: "application/json" },
    });
  });
});

describe("Ollama provider (mocked fetch)", () => {
  it("streams NDJSON", async () => {
    const lines = [{ message: { content: "a" } }, { message: { content: "b" } }, { done: true, prompt_eval_count: 3, eval_count: 2 }];
    const m = mockFetch(() => new Response(lines.map((l) => JSON.stringify(l)).join("\n")));
    const p = createOllamaProvider({ baseUrl: "http://o:11434", model: "q", fetchImpl: m.fn });
    const chunks = await collect(p.stream({ messages: [], maxOutputTokens: 3 }));
    expect(chunks.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("")).toBe("ab");
    expect(chunks.at(-1)).toEqual({ type: "usage", usage: { inputTokens: 3, outputTokens: 2 } });
    expect(m.calls[0]!.body).toMatchObject({ model: "q", options: { num_predict: 3 } });
  });
});

describe("HF embeddings (mocked fetch)", () => {
  it("normalizes returned vectors", async () => {
    const m = mockFetch(() => Response.json([[3, 4]]));
    const p = createHFEmbeddingProvider({ token: "t", model: "sentence-transformers/all-MiniLM-L6-v2", fetchImpl: m.fn });
    expect(await p.embed(["x"])).toEqual([[0.6, 0.8]]);
    expect(m.calls[0]!.url).toContain("sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction");
  });
});

describe("provider resolution from env", () => {
  it("returns null when nothing is configured (AI unavailable)", () => {
    expect(resolveChatProvider({})).toBeNull();
    expect(resolveEmbeddingProvider({})).toBeNull();
  });
  it("auto prefers hosted keys, then Ollama, then local models", () => {
    expect(resolveChatProvider({ GEMINI_API_KEY: "g", AI_LOCAL_MODELS: "true" })?.name).toBe("gemini");
    expect(resolveChatProvider({ GROQ_API_KEY: "x", GEMINI_API_KEY: "g" })?.name).toBe("groq");
    expect(resolveChatProvider({ OLLAMA_BASE_URL: "http://o", AI_LOCAL_MODELS: "1" })?.name).toBe("ollama");
    expect(resolveChatProvider({ AI_LOCAL_MODELS: "true" })?.name).toBe("local");
  });
  it("honors an explicit AI_PROVIDER and never requires a paid key", () => {
    expect(resolveChatProvider({ AI_PROVIDER: "none", GROQ_API_KEY: "x" })).toBeNull();
    expect(resolveChatProvider({ AI_PROVIDER: "groq" })).toBeNull(); // missing key -> unavailable, not a crash
    expect(resolveChatProvider({ AI_PROVIDER: "local" })?.model).toBe("onnx-community/Qwen2.5-1.5B-Instruct");
    expect(resolveEmbeddingProvider({ AI_EMBED_PROVIDER: "local" })?.dimensions).toBe(384);
  });
});
