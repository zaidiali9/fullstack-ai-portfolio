import { AIError, httpError } from "../errors";
import type { ChatProvider, GenerateRequest, StreamChunk, TokenUsage } from "../types";
import { readSSE } from "./sse";

export interface GeminiConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

const textOf = (r: GeminiResponse) => r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
const usageOf = (r: GeminiResponse): TokenUsage => ({
  inputTokens: r.usageMetadata?.promptTokenCount,
  outputTokens: r.usageMetadata?.candidatesTokenCount,
});

/** Google Gemini (free tier available via Google AI Studio keys). */
export function createGeminiProvider(cfg: GeminiConfig): ChatProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  const base = (cfg.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");

  const payload = (req: GenerateRequest) => {
    const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    return JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: req.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: {
        maxOutputTokens: req.maxOutputTokens,
        temperature: req.temperature ?? 0.2,
        ...(req.json ? { responseMimeType: "application/json" } : {}),
      },
    });
  };

  const post = async (req: GenerateRequest, path: string) => {
    const res = await doFetch(`${base}/models/${encodeURIComponent(cfg.model)}:${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
      body: payload(req),
      signal: req.signal,
    });
    if (!res.ok) throw httpError("gemini", res.status, await res.text().catch(() => ""));
    return res;
  };

  return {
    name: "gemini",
    model: cfg.model,
    async generate(req) {
      const json = (await (await post(req, "generateContent")).json()) as GeminiResponse;
      const text = textOf(json);
      if (!text) throw new AIError("provider_error", "The AI provider returned an empty response.");
      return { text, usage: usageOf(json) };
    },
    async *stream(req): AsyncIterable<StreamChunk> {
      const res = await post(req, "streamGenerateContent?alt=sse");
      if (!res.body) throw new AIError("provider_error", "The AI provider returned no stream.");
      let last: TokenUsage | undefined;
      for await (const data of readSSE(res.body)) {
        const chunk = JSON.parse(data) as GeminiResponse;
        const text = textOf(chunk);
        if (text) yield { type: "text", text };
        if (chunk.usageMetadata) last = usageOf(chunk);
      }
      if (last) yield { type: "usage", usage: last };
    },
  };
}
