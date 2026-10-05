import "server-only";
import { createAI, resolveChatProvider, type ChatProvider } from "@portfolio/ai";
import { db, schema } from "@/db";
import { createAnalyticsStub } from "@/server/ai/stub";

/**
 * AI_PROVIDER=stub is for automated end-to-end tests only. It is refused unless NODE_ENV is not
 * production or E2E=1, and every stub output is labeled "[stub]" so it can never be mistaken
 * for a real model answer.
 */
function stubAllowed() {
  return process.env.AI_PROVIDER === "stub" && (process.env.NODE_ENV !== "production" || process.env.E2E === "1");
}

let chat: ChatProvider | null | undefined;

function getChat() {
  if (chat !== undefined) return chat;
  if (stubAllowed()) chat = createAnalyticsStub();
  else if (process.env.AI_PROVIDER === "stub") chat = null;
  else chat = resolveChatProvider(process.env);
  return chat;
}

/** AI client; every call is logged to ai_usage with the feature name. */
export function getAI() {
  return createAI({
    chat: getChat(),
    embeddings: null,
    maxInputChars: 16_000,
    maxOutputTokens: 600,
    onUsage: async (e) => {
      await db.insert(schema.aiUsage).values({
        userId: e.userId ?? null,
        scope: "tally",
        feature: e.feature,
        kind: e.kind,
        provider: e.provider,
        model: e.model,
        inputTokens: e.inputTokens ?? null,
        outputTokens: e.outputTokens ?? null,
        latencyMs: e.latencyMs,
        ok: e.ok ? 1 : 0,
        errorCode: e.errorCode ?? null,
      });
    },
  });
}

export function aiStatus() {
  const c = getChat();
  return c ? { provider: c.name, model: c.model } : null;
}
