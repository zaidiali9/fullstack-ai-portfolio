import { AIError, httpError } from "../errors";
import type { EmbeddingProvider } from "../types";

export interface HFEmbeddingConfig {
  token: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Hugging Face Inference (free tier) feature-extraction for sentence-transformers models. */
export function createHFEmbeddingProvider(cfg: HFEmbeddingConfig): EmbeddingProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  const base = (cfg.baseUrl ?? "https://router.huggingface.co/hf-inference/models").replace(/\/$/, "");
  return {
    name: "huggingface",
    model: cfg.model,
    dimensions: 384,
    async embed(texts, signal) {
      const res = await doFetch(`${base}/${cfg.model}/pipeline/feature-extraction`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify({ inputs: texts, normalize: true }),
        signal,
      });
      if (!res.ok) throw httpError("huggingface", res.status, await res.text().catch(() => ""));
      const json = (await res.json()) as unknown;
      if (!Array.isArray(json) || json.length !== texts.length || !Array.isArray(json[0]))
        throw new AIError("provider_error", "The embedding provider returned an unexpected response.");
      return (json as number[][]).map(normalize);
    },
  };
}

export function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
