import { AIError, httpError } from "../errors";
import type { ChatProvider, GenerateRequest, GenerateResult, ProviderName, StreamChunk, TokenUsage } from "../types";
import { readSSE } from "./sse";

export interface OpenAICompatibleConfig {
  name: Extract<ProviderName, "groq" | "openai" | "huggingface">;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Not every OpenAI-compatible host supports response_format=json_object. */
  supportsJsonMode?: boolean;
  fetchImpl?: typeof fetch;
}

interface CompletionResponse {
  choices?: { message?: { content?: string | null }; delta?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

const toUsage = (u: CompletionResponse["usage"]): TokenUsage => ({
  inputTokens: u?.prompt_tokens,
  outputTokens: u?.completion_tokens,
});

/** Groq, OpenAI and the Hugging Face router all speak the OpenAI chat-completions protocol. */
export function createOpenAICompatibleProvider(cfg: OpenAICompatibleConfig): ChatProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const body = (req: GenerateRequest, stream: boolean) =>
    JSON.stringify({
      model: cfg.model,
      messages: req.messages,
      max_tokens: req.maxOutputTokens,
      temperature: req.temperature ?? 0.2,
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      ...(req.json && cfg.supportsJsonMode ? { response_format: { type: "json_object" } } : {}),
    });

  const post = async (req: GenerateRequest, stream: boolean) => {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: body(req, stream),
      signal: req.signal,
    });
    if (!res.ok) throw httpError(cfg.name, res.status, await res.text().catch(() => ""));
    return res;
  };

  return {
    name: cfg.name,
    model: cfg.model,
    async generate(req): Promise<GenerateResult> {
      const res = await post(req, false);
      const json = (await res.json()) as CompletionResponse;
      const text = json.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new AIError("provider_error", "The AI provider returned an empty response.", { detail: JSON.stringify(json).slice(0, 300) });
      return { text, usage: toUsage(json.usage) };
    },
    async *stream(req): AsyncIterable<StreamChunk> {
      const res = await post(req, true);
      if (!res.body) throw new AIError("provider_error", "The AI provider returned no stream.");
      for await (const data of readSSE(res.body)) {
        if (data === "[DONE]") break;
        const chunk = JSON.parse(data) as CompletionResponse;
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield { type: "text", text: delta };
        if (chunk.usage) yield { type: "usage", usage: toUsage(chunk.usage) };
      }
    },
  };
}
