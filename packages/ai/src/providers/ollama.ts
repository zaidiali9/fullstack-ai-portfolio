import { AIError, httpError } from "../errors";
import type { ChatProvider, EmbeddingProvider, GenerateRequest, StreamChunk } from "../types";
import { readLines } from "./sse";

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}

interface OllamaChatResponse {
  message?: { content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

/** Ollama running locally or on a private server (https://ollama.com). */
export function createOllamaProvider(cfg: OllamaConfig): ChatProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  const base = cfg.baseUrl.replace(/\/$/, "");

  const post = async (req: GenerateRequest, stream: boolean) => {
    const res = await doFetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        messages: req.messages,
        stream,
        ...(req.json ? { format: "json" } : {}),
        options: { num_predict: req.maxOutputTokens, temperature: req.temperature ?? 0.2 },
      }),
      signal: req.signal,
    });
    if (!res.ok) throw httpError("ollama", res.status, await res.text().catch(() => ""));
    return res;
  };

  return {
    name: "ollama",
    model: cfg.model,
    async generate(req) {
      const json = (await (await post(req, false)).json()) as OllamaChatResponse;
      if (json.error) throw new AIError("provider_error", "The AI provider had a temporary problem.", { detail: json.error });
      return {
        text: json.message?.content ?? "",
        usage: { inputTokens: json.prompt_eval_count, outputTokens: json.eval_count },
      };
    },
    async *stream(req): AsyncIterable<StreamChunk> {
      const res = await post(req, true);
      if (!res.body) throw new AIError("provider_error", "The AI provider returned no stream.");
      for await (const line of readLines(res.body)) {
        const chunk = JSON.parse(line) as OllamaChatResponse;
        if (chunk.error) throw new AIError("provider_error", "The AI provider had a temporary problem.", { detail: chunk.error });
        if (chunk.message?.content) yield { type: "text", text: chunk.message.content };
        if (chunk.done) yield { type: "usage", usage: { inputTokens: chunk.prompt_eval_count, outputTokens: chunk.eval_count } };
      }
    },
  };
}

/** Ollama's `all-minilm` is the same all-MiniLM-L6-v2 model (384 dims) used by the local and HF adapters. */
export function createOllamaEmbeddingProvider(cfg: OllamaConfig): EmbeddingProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  return {
    name: "ollama",
    model: cfg.model,
    dimensions: 384,
    async embed(texts, signal) {
      const res = await doFetch(`${cfg.baseUrl.replace(/\/$/, "")}/api/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: cfg.model, input: texts }),
        signal,
      });
      if (!res.ok) throw httpError("ollama", res.status, await res.text().catch(() => ""));
      const json = (await res.json()) as { embeddings?: number[][] };
      if (!json.embeddings || json.embeddings.length !== texts.length)
        throw new AIError("provider_error", "The embedding provider returned an unexpected response.");
      return json.embeddings;
    },
  };
}
