import os from "node:os";
import path from "node:path";
import { AIError } from "../errors";
import type { ChatMessage, ChatProvider, EmbeddingProvider, GenerateRequest, StreamChunk } from "../types";

/**
 * In-process open models via Transformers.js (ONNX Runtime on CPU). No API key, no server.
 * Models download once from the Hugging Face Hub into AI_CACHE_DIR (default ~/.cache/portfolio-ai).
 * Intended for local development, demos and evals; serverless hosts should use a hosted provider.
 */
export interface LocalConfig {
  model: string;
  cacheDir?: string;
  dtype?: string;
}

// The module is imported lazily so apps that never use local models don't load ONNX Runtime.
type TransformersModule = typeof import("@huggingface/transformers");
let modPromise: Promise<TransformersModule> | null = null;

async function loadTransformers(cacheDir?: string): Promise<TransformersModule> {
  modPromise ??= import("@huggingface/transformers").catch((err: unknown) => {
    modPromise = null;
    throw new AIError("unavailable", "AI unavailable: local model runtime is not installed.", {
      retryable: false,
      detail: String(err),
    });
  });
  const mod = await modPromise;
  mod.env.cacheDir = cacheDir ?? process.env.AI_CACHE_DIR ?? path.join(os.homedir(), ".cache", "portfolio-ai");
  return mod;
}

// Cache loaded pipelines across hot reloads / calls within one process.
const g = globalThis as unknown as { __portfolioLocalPipelines?: Map<string, Promise<unknown>> };
const pipelines = (g.__portfolioLocalPipelines ??= new Map());

function getPipeline<T>(key: string, factory: () => Promise<T>): Promise<T> {
  let p = pipelines.get(key) as Promise<T> | undefined;
  if (!p) {
    p = factory().catch((err: unknown) => {
      pipelines.delete(key);
      throw err instanceof AIError
        ? err
        : new AIError("unavailable", "AI unavailable: the local model could not be loaded.", { retryable: false, detail: String(err) });
    });
    pipelines.set(key, p);
  }
  return p;
}

// One generation at a time per process: parallel ONNX sessions on CPU only slow each other down.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

interface TextGenPipeline {
  (messages: ChatMessage[], opts: Record<string, unknown>): Promise<{ generated_text: ChatMessage[] }[]>;
  tokenizer: {
    apply_chat_template(m: ChatMessage[], o: Record<string, unknown>): unknown;
    encode(text: string): number[];
  };
}

export function createLocalProvider(cfg: LocalConfig): ChatProvider {
  const dtype = cfg.dtype ?? "q4";
  const load = async () => {
    const mod = await loadTransformers(cfg.cacheDir);
    return getPipeline(`gen:${cfg.model}:${dtype}`, async () =>
      (await mod.pipeline("text-generation", cfg.model, { dtype: dtype as "q4", device: "cpu" })) as unknown as TextGenPipeline,
    );
  };

  const countInput = (gen: TextGenPipeline, messages: ChatMessage[]) => {
    try {
      const prompt = gen.tokenizer.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true });
      return typeof prompt === "string" ? gen.tokenizer.encode(prompt).length : undefined;
    } catch {
      return undefined;
    }
  };

  /** Runs generation, invoking onText for each decoded fragment. Abort interrupts decoding. */
  const run = async (req: GenerateRequest, onText?: (t: string) => void) => {
    const mod = await loadTransformers(cfg.cacheDir);
    const gen = await load();
    return serialize(async () => {
      if (req.signal?.aborted) throw req.signal.reason ?? new DOMException("Aborted", "AbortError");
      const stopper = new mod.InterruptableStoppingCriteria();
      const onAbort = () => stopper.interrupt();
      req.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const streamer = onText
          ? new mod.TextStreamer(gen.tokenizer as never, { skip_prompt: true, skip_special_tokens: true, callback_function: onText })
          : undefined;
        const temperature = req.temperature ?? 0;
        const out = await gen(req.messages, {
          max_new_tokens: req.maxOutputTokens,
          do_sample: temperature > 0,
          ...(temperature > 0 ? { temperature } : {}),
          streamer,
          stopping_criteria: stopper,
        });
        if (req.signal?.aborted) throw req.signal.reason ?? new DOMException("Aborted", "AbortError");
        const text = out[0]?.generated_text.at(-1)?.content ?? "";
        return { text, usage: { inputTokens: countInput(gen, req.messages), outputTokens: gen.tokenizer.encode(text).length } };
      } finally {
        req.signal?.removeEventListener("abort", onAbort);
      }
    });
  };

  return {
    name: "local",
    model: cfg.model,
    generate: (req) => run(req),
    async *stream(req): AsyncIterable<StreamChunk> {
      // Bridge the callback-based streamer into an async iterator.
      const pending: string[] = [];
      let wake: (() => void) | null = null;
      let finished = false;
      let failure: unknown;
      let usage: { inputTokens?: number; outputTokens?: number } | undefined;
      const notify = () => {
        wake?.();
        wake = null;
      };
      run(req, (t) => {
        pending.push(t);
        notify();
      }).then(
        (r) => {
          usage = r.usage;
          finished = true;
          notify();
        },
        (e: unknown) => {
          failure = e;
          finished = true;
          notify();
        },
      );
      while (true) {
        if (pending.length) {
          yield { type: "text", text: pending.shift()! };
          continue;
        }
        if (finished) break;
        await new Promise<void>((r) => (wake = r));
      }
      if (failure) throw failure;
      if (usage) yield { type: "usage", usage };
    },
  };
}

interface FeaturePipeline {
  (texts: string[], opts: { pooling: "mean"; normalize: boolean }): Promise<{ tolist(): number[][] }>;
}

export function createLocalEmbeddingProvider(cfg: LocalConfig): EmbeddingProvider {
  const dtype = cfg.dtype ?? "q8";
  return {
    name: "local",
    model: cfg.model,
    dimensions: 384,
    async embed(texts, signal) {
      const mod = await loadTransformers(cfg.cacheDir);
      const fe = await getPipeline(`emb:${cfg.model}:${dtype}`, async () =>
        (await mod.pipeline("feature-extraction", cfg.model, { dtype: dtype as "q8", device: "cpu" })) as unknown as FeaturePipeline,
      );
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      const out = await fe(texts, { pooling: "mean", normalize: true });
      return out.tolist();
    },
  };
}
