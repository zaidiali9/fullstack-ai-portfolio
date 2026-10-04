import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AIError, createAI, type ChatProvider, type UsageEvent } from "../src";
import { createStubChatProvider, createStubEmbeddingProvider } from "../src/testing";

const noSleep = async (_ms: number) => {};
const msgs = [{ role: "user" as const, content: "hi" }];

function flaky(failures: AIError[], text = "ok"): ChatProvider & { calls: number } {
  const p = {
    name: "stub" as const,
    model: "flaky",
    calls: 0,
    async generate() {
      p.calls++;
      const f = failures.shift();
      if (f) throw f;
      return { text, usage: { inputTokens: 3, outputTokens: 1 } };
    },
    async *stream() {
      p.calls++;
      const f = failures.shift();
      if (f) throw f;
      yield { type: "text" as const, text };
    },
  };
  return p;
}

describe("createAI (stub provider)", () => {
  it("reports AI unavailable when no provider is configured", async () => {
    const ai = createAI({ chat: null, embeddings: null });
    expect(ai.status().chat.available).toBe(false);
    await expect(ai.generateText({ feature: "t", messages: msgs })).rejects.toMatchObject({ code: "unavailable" });
    await expect(ai.embed({ feature: "t", texts: ["a"] })).rejects.toMatchObject({ code: "unavailable" });
  });

  it("retries retryable errors with backoff, then succeeds", async () => {
    const p = flaky([new AIError("rate_limited", "busy"), new AIError("provider_error", "500")]);
    const sleep = vi.fn(noSleep);
    const ai = createAI({ chat: p, embeddings: null, sleep });
    const r = await ai.generateText({ feature: "t", messages: msgs });
    expect(r.text).toBe("ok");
    expect(p.calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    const [first, second] = sleep.mock.calls.map((c) => c[0] as number);
    expect(second!).toBeGreaterThan(first!);
  });

  it("does not retry non-retryable errors", async () => {
    const p = flaky([new AIError("unavailable", "bad key", { retryable: false })]);
    const ai = createAI({ chat: p, embeddings: null, sleep: noSleep });
    await expect(ai.generateText({ feature: "t", messages: msgs })).rejects.toMatchObject({ code: "unavailable" });
    expect(p.calls).toBe(1);
  });

  it("gives up after maxRetries", async () => {
    const p = flaky([1, 2, 3, 4].map(() => new AIError("provider_error", "x")));
    const ai = createAI({ chat: p, embeddings: null, sleep: noSleep, maxRetries: 2 });
    await expect(ai.generateText({ feature: "t", messages: msgs })).rejects.toMatchObject({ code: "provider_error" });
    expect(p.calls).toBe(3);
  });

  it("times out slow providers", async () => {
    const slow: ChatProvider = {
      name: "stub",
      model: "slow",
      generate: (req) =>
        new Promise((_, reject) => req.signal?.addEventListener("abort", () => reject(req.signal?.reason))),
      async *stream() {},
    };
    const ai = createAI({ chat: slow, embeddings: null, sleep: noSleep, maxRetries: 0, timeoutMs: 20 });
    await expect(ai.generateText({ feature: "t", messages: msgs })).rejects.toMatchObject({ code: "timeout" });
  });

  it("rejects oversized input and clamps output tokens", async () => {
    const seen: number[] = [];
    const p = createStubChatProvider((req) => {
      seen.push(req.maxOutputTokens);
      return "ok";
    });
    const ai = createAI({ chat: p, embeddings: null, maxInputChars: 10, maxOutputTokens: 50 });
    await expect(ai.generateText({ feature: "t", messages: [{ role: "user", content: "x".repeat(11) }] })).rejects.toMatchObject({
      code: "input_too_long",
    });
    await ai.generateText({ feature: "t", messages: msgs, maxOutputTokens: 5000 });
    expect(seen).toEqual([50]);
  });

  it("logs usage for success and failure", async () => {
    const events: UsageEvent[] = [];
    const p = flaky([new AIError("unavailable", "x", { retryable: false })]);
    const ai = createAI({ chat: p, embeddings: null, onUsage: (e) => void events.push(e) });
    await expect(ai.generateText({ feature: "triage", messages: msgs, userId: "u1" })).rejects.toThrow();
    await ai.generateText({ feature: "triage", messages: msgs, userId: "u1" });
    expect(events.map((e) => [e.feature, e.ok, e.errorCode, e.userId])).toEqual([
      ["triage", false, "unavailable", "u1"],
      ["triage", true, undefined, "u1"],
    ]);
    expect(events[1]).toMatchObject({ inputTokens: 3, outputTokens: 1, provider: "stub" });
  });

  it("a failing usage logger never breaks the AI call", async () => {
    const ai = createAI({ chat: createStubChatProvider(() => "ok"), embeddings: null, onUsage: () => Promise.reject(new Error("db down")) });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(ai.generateText({ feature: "t", messages: msgs })).resolves.toMatchObject({ text: "ok" });
    spy.mockRestore();
  });
});

describe("generateObject (stub provider)", () => {
  const schema = z.object({ category: z.enum(["billing", "technical"]), priority: z.number().int().min(1).max(4) });

  it("parses fenced JSON with surrounding prose", async () => {
    const ai = createAI({ chat: createStubChatProvider(() => 'Sure!\n```json\n{"category":"billing","priority":2}\n```'), embeddings: null });
    const r = await ai.generateObject({ feature: "t", schema, messages: [{ role: "system", content: "classify" }, ...msgs] });
    expect(r.object).toEqual({ category: "billing", priority: 2 });
    expect(r.attempts).toBe(1);
  });

  it("appends the JSON schema to the system prompt", async () => {
    let system = "";
    const ai = createAI({
      chat: createStubChatProvider((req) => {
        system = req.messages[0]!.content;
        return '{"category":"technical","priority":1}';
      }),
      embeddings: null,
    });
    await ai.generateObject({ feature: "t", schema, messages: [{ role: "system", content: "classify" }, ...msgs] });
    expect(system).toContain("classify");
    expect(system).toContain('"enum":["billing","technical"]');
  });

  it("repairs invalid output by quoting validation errors", async () => {
    const replies = ['{"category":"sales","priority":9}', '{"category":"billing","priority":3}'];
    const seen: string[] = [];
    const ai = createAI({
      chat: createStubChatProvider((req) => {
        seen.push(req.messages.at(-1)!.content);
        return replies.shift()!;
      }),
      embeddings: null,
    });
    const r = await ai.generateObject({ feature: "t", schema, messages: msgs });
    expect(r.object).toEqual({ category: "billing", priority: 3 });
    expect(r.attempts).toBe(2);
    expect(seen[1]).toMatch(/failed validation/);
  });

  it("throws invalid_output after maxAttempts", async () => {
    const ai = createAI({ chat: createStubChatProvider(() => "I cannot do that"), embeddings: null });
    await expect(ai.generateObject({ feature: "t", schema, messages: msgs, maxAttempts: 2 })).rejects.toMatchObject({ code: "invalid_output" });
  });
});

describe("streamText (stub provider)", () => {
  it("streams fragments and returns the full text", async () => {
    const ai = createAI({ chat: createStubChatProvider(() => "Hello streaming world, this is long."), embeddings: null });
    const gen = ai.streamText({ feature: "t", messages: msgs });
    const parts: string[] = [];
    let r = await gen.next();
    while (!r.done) {
      parts.push(r.value);
      r = await gen.next();
    }
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe("Hello streaming world, this is long.");
    expect(r.value.text).toBe(parts.join(""));
  });

  it("retries a stream that fails before the first fragment", async () => {
    const p = flaky([new AIError("rate_limited", "busy")], "after retry");
    const ai = createAI({ chat: p, embeddings: null, sleep: noSleep });
    const out: string[] = [];
    for await (const t of ai.streamText({ feature: "t", messages: msgs })) out.push(t);
    expect(out.join("")).toBe("after retry");
    expect(p.calls).toBe(2);
  });
});

describe("embed (stub provider)", () => {
  it("batches requests and returns one vector per text", async () => {
    const emb = createStubEmbeddingProvider();
    const spy = vi.spyOn(emb, "embed");
    const ai = createAI({ chat: null, embeddings: emb, maxEmbeddingBatch: 2 });
    const v = await ai.embed({ feature: "t", texts: ["a b", "c", "d e f"] });
    expect(v).toHaveLength(3);
    expect(v[0]).toHaveLength(384);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("generateObject prepare hook (stub provider)", () => {
  it("normalizes raw output before validation", async () => {
    const schema = z.object({ category: z.enum(["billing", "technical"]) });
    const ai = createAI({ chat: createStubChatProvider(() => '{"category":" Billing "}'), embeddings: null });
    const r = await ai.generateObject({
      feature: "t",
      schema,
      messages: msgs,
      prepare: (raw) => ({ category: String((raw as { category: string }).category).trim().toLowerCase() }),
    });
    expect(r.object.category).toBe("billing");
  });
});
