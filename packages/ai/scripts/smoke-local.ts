// Live smoke test: real local model calls through the shared AI layer (no stubs).
import { z } from "zod";
import { createAI } from "../src";

const ai = createAI({ env: { AI_LOCAL_MODELS: "true", AI_LOCAL_MODEL: process.env.AI_LOCAL_MODEL }, timeoutMs: 300_000, onUsage: (e) => console.log("usage:", JSON.stringify(e)) });
console.log("status:", JSON.stringify(ai.status()));
const t0 = Date.now();
const r = await ai.generateObject({
  feature: "smoke",
  schema: z.object({ category: z.enum(["billing", "technical", "account", "other"]), priority: z.enum(["low", "medium", "high", "urgent"]) }),
  messages: [
    { role: "system", content: "You classify customer support tickets." },
    { role: "user", content: "I was charged twice this month and nobody answers my emails!" },
  ],
  maxOutputTokens: 80,
});
console.log("object:", JSON.stringify(r.object), "attempts:", r.attempts, "ms:", Date.now() - t0);
let streamed = "";
for await (const t of ai.streamText({ feature: "smoke-stream", messages: [{ role: "user", content: "In one sentence, what is a refund?" }], maxOutputTokens: 40 })) streamed += t;
console.log("stream:", JSON.stringify(streamed));
const [a, b] = await ai.embed({ feature: "smoke-embed", texts: ["refund my order", "I want my money back"] });
console.log("embed dims:", a!.length, "cos:", a!.reduce((s, x, i) => s + x * b![i]!, 0).toFixed(3));
