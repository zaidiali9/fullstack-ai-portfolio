import { createGeminiProvider } from "./providers/gemini";
import { createHFEmbeddingProvider } from "./providers/huggingface";
import { createLocalEmbeddingProvider, createLocalProvider } from "./providers/local";
import { createOllamaEmbeddingProvider, createOllamaProvider } from "./providers/ollama";
import { createOpenAICompatibleProvider } from "./providers/openai-compatible";
import type { ChatProvider, EmbeddingProvider } from "./types";

export type Env = Record<string, string | undefined>;

export const DEFAULT_MODELS = {
  local: "onnx-community/Qwen2.5-1.5B-Instruct",
  localEmbedding: "Xenova/all-MiniLM-L6-v2",
  ollama: "qwen2.5:1.5b",
  ollamaEmbedding: "all-minilm",
  groq: "llama-3.1-8b-instant",
  gemini: "gemini-2.5-flash",
  huggingface: "meta-llama/Llama-3.1-8B-Instruct",
  hfEmbedding: "sentence-transformers/all-MiniLM-L6-v2",
  openai: "gpt-4.1-mini",
} as const;

const truthy = (v: string | undefined) => v === "1" || v?.toLowerCase() === "true";

/**
 * Pick the chat provider from environment variables.
 * AI_PROVIDER = auto | local | ollama | groq | gemini | huggingface | openai | none (default auto).
 * auto order: GROQ_API_KEY, GEMINI_API_KEY, HF_TOKEN, OPENAI_API_KEY, OLLAMA_BASE_URL, AI_LOCAL_MODELS=true.
 * Returns null when nothing is configured, which the app must surface as "AI unavailable".
 */
export function resolveChatProvider(env: Env, fetchImpl?: typeof fetch): ChatProvider | null {
  const choice = (env.AI_PROVIDER ?? "auto").toLowerCase();
  const build: Record<string, () => ChatProvider | null> = {
    none: () => null,
    local: () => createLocalProvider({ model: env.AI_LOCAL_MODEL ?? DEFAULT_MODELS.local, cacheDir: env.AI_CACHE_DIR }),
    ollama: () =>
      createOllamaProvider({
        baseUrl: env.OLLAMA_BASE_URL ?? "http://localhost:11434",
        model: env.OLLAMA_MODEL ?? DEFAULT_MODELS.ollama,
        fetchImpl,
      }),
    groq: () =>
      env.GROQ_API_KEY
        ? createOpenAICompatibleProvider({
            name: "groq",
            baseUrl: "https://api.groq.com/openai/v1",
            apiKey: env.GROQ_API_KEY,
            model: env.GROQ_MODEL ?? DEFAULT_MODELS.groq,
            supportsJsonMode: true,
            fetchImpl,
          })
        : null,
    gemini: () =>
      env.GEMINI_API_KEY
        ? createGeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL ?? DEFAULT_MODELS.gemini, fetchImpl })
        : null,
    huggingface: () =>
      env.HF_TOKEN
        ? createOpenAICompatibleProvider({
            name: "huggingface",
            baseUrl: "https://router.huggingface.co/v1",
            apiKey: env.HF_TOKEN,
            model: env.HF_CHAT_MODEL ?? DEFAULT_MODELS.huggingface,
            fetchImpl,
          })
        : null,
    openai: () =>
      env.OPENAI_API_KEY
        ? createOpenAICompatibleProvider({
            name: "openai",
            baseUrl: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
            apiKey: env.OPENAI_API_KEY,
            model: env.OPENAI_MODEL ?? DEFAULT_MODELS.openai,
            supportsJsonMode: true,
            fetchImpl,
          })
        : null,
  };
  if (choice !== "auto") return build[choice]?.() ?? null;
  if (env.GROQ_API_KEY) return build.groq!();
  if (env.GEMINI_API_KEY) return build.gemini!();
  if (env.HF_TOKEN) return build.huggingface!();
  if (env.OPENAI_API_KEY) return build.openai!();
  if (env.OLLAMA_BASE_URL) return build.ollama!();
  if (truthy(env.AI_LOCAL_MODELS)) return build.local!();
  return null;
}

/**
 * Embeddings are always all-MiniLM-L6-v2 (384 dims) so stored vectors stay compatible across providers.
 * AI_EMBED_PROVIDER = auto | local | ollama | huggingface | none.
 */
export function resolveEmbeddingProvider(env: Env, fetchImpl?: typeof fetch): EmbeddingProvider | null {
  const choice = (env.AI_EMBED_PROVIDER ?? "auto").toLowerCase();
  const build: Record<string, () => EmbeddingProvider | null> = {
    none: () => null,
    local: () => createLocalEmbeddingProvider({ model: DEFAULT_MODELS.localEmbedding, cacheDir: env.AI_CACHE_DIR }),
    ollama: () =>
      createOllamaEmbeddingProvider({
        baseUrl: env.OLLAMA_BASE_URL ?? "http://localhost:11434",
        model: DEFAULT_MODELS.ollamaEmbedding,
        fetchImpl,
      }),
    huggingface: () =>
      env.HF_TOKEN ? createHFEmbeddingProvider({ token: env.HF_TOKEN, model: DEFAULT_MODELS.hfEmbedding, fetchImpl }) : null,
  };
  if (choice !== "auto") return build[choice]?.() ?? null;
  if (env.HF_TOKEN) return build.huggingface!();
  if (env.OLLAMA_BASE_URL) return build.ollama!();
  if (truthy(env.AI_LOCAL_MODELS)) return build.local!();
  return null;
}
