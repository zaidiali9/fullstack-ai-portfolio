import "server-only";
import { createAI, resolveChatProvider, resolveEmbeddingProvider, type ChatProvider, type EmbeddingProvider } from "@portfolio/ai";
import { createStubChatProvider, createStubEmbeddingProvider } from "@portfolio/ai/testing";
import { db, schema } from "@/db";

/** AI_PROVIDER=stub: automated tests only (refused in production unless E2E=1); outputs say "[stub]". */
function stubAllowed() {
  return process.env.AI_PROVIDER === "stub" && (process.env.NODE_ENV !== "production" || process.env.E2E === "1");
}

const stubChat = () =>
  createStubChatProvider(() =>
    JSON.stringify({
      description: "[stub] A dependable everyday item described by the test stub. It is made for the use described in the attributes and is easy to care for.",
      highlights: ["[stub] First highlight", "[stub] Second highlight", "[stub] Third highlight"],
    }),
  );

let providers: { chat: ChatProvider | null; embeddings: EmbeddingProvider | null } | undefined;
function getProviders() {
  if (providers) return providers;
  if (stubAllowed()) providers = { chat: stubChat(), embeddings: createStubEmbeddingProvider() };
  else if (process.env.AI_PROVIDER === "stub") providers = { chat: null, embeddings: null };
  else providers = { chat: resolveChatProvider(process.env), embeddings: resolveEmbeddingProvider(process.env) };
  return providers;
}

/** AI client; every call is logged to ai_usage with the acting user (if any). */
export function getAI() {
  const p = getProviders();
  return createAI({
    chat: p.chat,
    embeddings: p.embeddings,
    maxInputChars: 8_000,
    maxOutputTokens: 500,
    onUsage: async (e) => {
      await db.insert(schema.aiUsage).values({
        userId: e.userId ?? null,
        scope: "store",
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
  const p = getProviders();
  return {
    chat: p.chat ? { provider: p.chat.name, model: p.chat.model } : null,
    embeddings: p.embeddings ? { provider: p.embeddings.name, model: p.embeddings.model } : null,
  };
}
