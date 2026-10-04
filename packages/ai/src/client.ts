import { z } from "zod";
import { resolveChatProvider, resolveEmbeddingProvider, type Env } from "./config";
import { AIError, aiUnavailable, toAIError } from "./errors";
import { extractJson } from "./structured";
import type { AIStatus, ChatMessage, ChatProvider, EmbeddingProvider, TokenUsage, UsageEvent } from "./types";

export interface AIClientOptions {
  /** Explicit providers (tests, custom wiring). `null` means "not configured". Omit to resolve from env. */
  chat?: ChatProvider | null;
  embeddings?: EmbeddingProvider | null;
  env?: Env;
  /** Called once per provider call (success or failure) — persist it for cost tracking. */
  onUsage?: (event: UsageEvent) => void | Promise<void>;
  timeoutMs?: number;
  maxRetries?: number;
  /** Hard cap on total prompt characters. Callers should truncate untrusted content before this. */
  maxInputChars?: number;
  /** Hard cap on output tokens; per-call requests are clamped to it. */
  maxOutputTokens?: number;
  maxEmbeddingBatch?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface CallOptions {
  feature: string;
  userId?: string;
  signal?: AbortSignal;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface TextResult {
  text: string;
  usage: TokenUsage;
  provider: string;
  model: string;
}

export interface ObjectResult<T> extends TextResult {
  object: T;
  attempts: number;
}

export type AIClient = ReturnType<typeof createAI>;

function schemaJson(schema: z.ZodType): string {
  try {
    const json = z.toJSONSchema(schema, { unrepresentable: "any" }) as Record<string, unknown>;
    delete json.$schema;
    return JSON.stringify(json);
  } catch {
    return "(see the instructions above)";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createAI(opts: AIClientOptions = {}) {
  const env = opts.env ?? process.env;
  const chat = opts.chat !== undefined ? opts.chat : resolveChatProvider(env);
  const embeddings = opts.embeddings !== undefined ? opts.embeddings : resolveEmbeddingProvider(env);
  const timeoutMs = opts.timeoutMs ?? Number(env.AI_TIMEOUT_MS ?? 60_000);
  const maxRetries = opts.maxRetries ?? 2;
  const maxInputChars = opts.maxInputChars ?? 24_000;
  const outputCap = opts.maxOutputTokens ?? 1024;
  const maxBatch = opts.maxEmbeddingBatch ?? 64;
  const sleep = opts.sleep ?? defaultSleep;

  const report = async (event: UsageEvent) => {
    try {
      await opts.onUsage?.(event);
    } catch (err) {
      console.error("[ai] usage logging failed", err);
    }
  };

  const signalFor = (call: { signal?: AbortSignal; timeoutMs?: number }) => {
    const t = AbortSignal.timeout(call.timeoutMs ?? timeoutMs);
    return call.signal ? AbortSignal.any([t, call.signal]) : t;
  };

  async function withRetry<T>(fn: (attempt: number) => Promise<T>, call: { signal?: AbortSignal }): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn(attempt);
      } catch (err) {
        const e = err instanceof AIError ? err : toAIError(err);
        if (!e.retryable || attempt >= maxRetries || call.signal?.aborted) throw e;
        const backoff = 400 * 2 ** attempt + Math.floor(Math.random() * 200);
        await sleep(backoff);
      }
    }
  }

  const requireChat = (): ChatProvider => {
    if (!chat) throw aiUnavailable();
    return chat;
  };

  const checkInput = (messages: ChatMessage[]) => {
    const total = messages.reduce((n, m) => n + m.content.length, 0);
    if (total > maxInputChars)
      throw new AIError("input_too_long", `The request is too long for the AI (${total} > ${maxInputChars} characters).`, {
        retryable: false,
      });
  };

  async function generateText(call: CallOptions & { messages: ChatMessage[]; json?: boolean }): Promise<TextResult> {
    const provider = requireChat();
    checkInput(call.messages);
    const started = Date.now();
    try {
      const result = await withRetry(async () => {
        const signal = signalFor(call);
        try {
          return await provider.generate({
            messages: call.messages,
            maxOutputTokens: Math.min(call.maxOutputTokens ?? outputCap, outputCap),
            temperature: call.temperature,
            json: call.json,
            signal,
          });
        } catch (err) {
          throw toAIError(err, signal);
        }
      }, call);
      await report({ feature: call.feature, kind: "chat", provider: provider.name, model: provider.model, userId: call.userId, ...result.usage, latencyMs: Date.now() - started, ok: true });
      return { ...result, provider: provider.name, model: provider.model };
    } catch (err) {
      const e = toAIError(err);
      await report({ feature: call.feature, kind: "chat", provider: provider.name, model: provider.model, userId: call.userId, latencyMs: Date.now() - started, ok: false, errorCode: e.code });
      throw e;
    }
  }

  /**
   * Stream text fragments. Retries only happen before the first fragment is emitted, so callers
   * never see duplicated text. Usage is reported when the stream ends.
   */
  async function* streamText(call: CallOptions & { messages: ChatMessage[] }): AsyncGenerator<string, TextResult> {
    const provider = requireChat();
    checkInput(call.messages);
    const started = Date.now();
    let usage: TokenUsage = {};
    let text = "";
    let emitted = false;
    try {
      for (let attempt = 0; ; attempt++) {
        const signal = signalFor(call);
        try {
          for await (const chunk of provider.stream({
            messages: call.messages,
            maxOutputTokens: Math.min(call.maxOutputTokens ?? outputCap, outputCap),
            temperature: call.temperature,
            signal,
          })) {
            if (chunk.type === "text") {
              emitted = true;
              text += chunk.text;
              yield chunk.text;
            } else usage = chunk.usage;
          }
          break;
        } catch (err) {
          const e = toAIError(err, signal);
          if (emitted || !e.retryable || attempt >= maxRetries || call.signal?.aborted) throw e;
          await sleep(400 * 2 ** attempt);
        }
      }
      await report({ feature: call.feature, kind: "chat", provider: provider.name, model: provider.model, userId: call.userId, ...usage, latencyMs: Date.now() - started, ok: true });
      return { text, usage, provider: provider.name, model: provider.model };
    } catch (err) {
      const e = toAIError(err);
      await report({ feature: call.feature, kind: "chat", provider: provider.name, model: provider.model, userId: call.userId, latencyMs: Date.now() - started, ok: false, errorCode: e.code });
      throw e;
    }
  }

  /**
   * Generate JSON validated by a zod schema. The JSON Schema is appended to the system prompt;
   * invalid output gets up to `maxAttempts - 1` repair turns that quote the validation errors.
   */
  async function generateObject<S extends z.ZodType>(
    call: CallOptions & {
      messages: ChatMessage[];
      schema: S;
      maxAttempts?: number;
      schemaHint?: boolean;
      /** Normalize the raw parsed JSON before validation (e.g. lowercase enum values). */
      prepare?: (raw: unknown) => unknown;
    },
  ): Promise<ObjectResult<z.output<S>>> {
    const maxAttempts = call.maxAttempts ?? 3;
    const hint =
      call.schemaHint === false
        ? ""
        : `\n\nRespond with ONLY a JSON value (no prose, no code fences) that matches this JSON Schema:\n${JSON.stringify(z.toJSONSchema(call.schema))}`;
    const messages: ChatMessage[] = call.messages.map((m, i) =>
      i === 0 && m.role === "system" ? { ...m, content: m.content + hint } : m,
    );
    if (messages[0]?.role !== "system" && hint) messages.unshift({ role: "system", content: hint.trim() });

    let last: TextResult | undefined;
    let lastError = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      last = await generateText({ ...call, messages, json: true, temperature: call.temperature ?? 0 });
      let parsed: unknown;
      try {
        parsed = extractJson(last.text);
      } catch {
        lastError = "The reply did not contain valid JSON.";
        messages.push({ role: "assistant", content: last.text.slice(0, 2000) }, { role: "user", content: `${lastError} Reply with only the JSON value.` });
        continue;
      }
      const result = call.schema.safeParse(call.prepare ? call.prepare(parsed) : parsed);
      if (result.success) return { ...last, object: result.data, attempts: attempt };
      lastError = z.prettifyError(result.error).slice(0, 1000);
      messages.push(
        { role: "assistant", content: last.text.slice(0, 2000) },
        { role: "user", content: `That JSON failed validation:\n${lastError}\nReply with only the corrected JSON value.` },
      );
    }
    throw new AIError("invalid_output", "The AI returned an answer in an unexpected format. Please try again.", {
      retryable: false,
      detail: `${lastError} | last output: ${last?.text.slice(0, 300)}`,
    });
  }

  async function embed(call: { texts: string[]; feature: string; userId?: string; signal?: AbortSignal; timeoutMs?: number }): Promise<number[][]> {
    if (!embeddings) throw aiUnavailable();
    const started = Date.now();
    const out: number[][] = [];
    try {
      for (let i = 0; i < call.texts.length; i += maxBatch) {
        const batch = call.texts.slice(i, i + maxBatch).map((t) => t.slice(0, 8000));
        const vectors = await withRetry(async () => {
          const signal = signalFor(call);
          try {
            return await embeddings.embed(batch, signal);
          } catch (err) {
            throw toAIError(err, signal);
          }
        }, call);
        out.push(...vectors);
      }
      await report({ feature: call.feature, kind: "embedding", provider: embeddings.name, model: embeddings.model, userId: call.userId, inputTokens: undefined, latencyMs: Date.now() - started, ok: true });
      return out;
    } catch (err) {
      const e = toAIError(err);
      await report({ feature: call.feature, kind: "embedding", provider: embeddings.name, model: embeddings.model, userId: call.userId, latencyMs: Date.now() - started, ok: false, errorCode: e.code });
      throw e;
    }
  }

  function status(): AIStatus {
    return {
      chat: { available: !!chat, provider: chat?.name ?? null, model: chat?.model ?? null },
      embeddings: { available: !!embeddings, provider: embeddings?.name ?? null, model: embeddings?.model ?? null },
    };
  }

  return { generateText, streamText, generateObject, embed, status };
}
