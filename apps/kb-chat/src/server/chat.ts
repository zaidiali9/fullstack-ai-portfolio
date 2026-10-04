import "server-only";
import { and, asc, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { AIError } from "@portfolio/ai";
import { HttpError, notFound as notFoundError } from "@portfolio/kit";
import { db, schema } from "@/db";
import type { Citation, Workspace } from "@db/schema";
import { getAI } from "@/lib/ai";
import { attributeCitations, buildAnswerMessages, isRefusal, REFUSAL, type Source } from "./rag/core";
import { retrieve } from "./rag/retrieve";

export const askInput = z.object({
  question: z.string().trim().min(2, "Ask a question").max(1000, "Questions are limited to 1,000 characters"),
  conversationId: z.uuid().optional(),
});

export interface Asker {
  ws: Workspace;
  /** Signed-in user, or null for anonymous widget visitors. */
  userId: string | null;
  source: "app" | "widget";
}

export async function questionsThisMonth(workspaceId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(schema.messages)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
    .where(and(eq(schema.conversations.workspaceId, workspaceId), eq(schema.messages.role, "user"), gte(schema.messages.createdAt, sql`date_trunc('month', now())`)));
  return r?.n ?? 0;
}

async function loadConversation(asker: Asker, conversationId: string) {
  const [c] = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.id, conversationId),
        eq(schema.conversations.workspaceId, asker.ws.id),
        eq(schema.conversations.source, asker.source),
        asker.userId ? eq(schema.conversations.userId, asker.userId) : isNull(schema.conversations.userId),
      ),
    )
    .limit(1);
  if (!c) throw notFoundError("Conversation");
  return c;
}

/** Sent to the client as a stream trailer once the answer is complete. */
export interface AnswerMeta {
  content: string;
  status: "ok" | "refused";
  citations: Citation[];
}

export interface AskResult {
  conversationId: string;
  /** Sources given to the model, numbered as in the prompt. */
  sources: { n: number; chunkId: string; documentId: string; title: string; page: number | null }[];
  /** Streams the answer; persists it (with citations) when complete and returns the final AnswerMeta. */
  stream: AsyncGenerator<string, AnswerMeta | undefined>;
}

/**
 * Answer a question from the workspace's documents. If retrieval finds nothing relevant the
 * refusal is returned WITHOUT calling the model (no cost, no chance to hallucinate).
 */
export async function ask(asker: Asker, input: z.infer<typeof askInput>): Promise<AskResult> {
  const ai = getAI({ workspaceId: asker.ws.id });
  if (!ai.status().chat.available) throw new AIError("unavailable", "AI unavailable: no AI provider is configured on this server.", { retryable: false });
  if ((await questionsThisMonth(asker.ws.id)) >= asker.ws.monthlyQuestionLimit) {
    throw new HttpError(429, "monthly_limit", `This workspace has used its ${asker.ws.monthlyQuestionLimit} questions for this month.`);
  }

  const conversation = input.conversationId
    ? await loadConversation(asker, input.conversationId)
    : (
        await db
          .insert(schema.conversations)
          .values({ workspaceId: asker.ws.id, userId: asker.userId, source: asker.source, title: input.question.slice(0, 80) })
          .returning()
      )[0]!;

  const history = input.conversationId
    ? (
        await db
          .select({ role: schema.messages.role, content: schema.messages.content })
          .from(schema.messages)
          .where(eq(schema.messages.conversationId, conversation.id))
          .orderBy(desc(schema.messages.createdAt))
          .limit(4)
      ).reverse()
    : [];

  await db.insert(schema.messages).values({ conversationId: conversation.id, role: "user", content: input.question });

  // Follow-up questions ("and how long does that take?") retrieve better with the previous question.
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const retrieval = await retrieve(asker.ws.id, lastUser ? `${lastUser.content}\n${input.question}` : input.question, 5);
  const sources: Source[] = retrieval.sources;
  const numbered = sources.map((s, i) => ({ n: i + 1, chunkId: s.chunkId, documentId: s.documentId, title: s.title, page: s.page }));

  const save = async (content: string, status: "ok" | "refused" | "error", citations: Citation[]) => {
    await db.insert(schema.messages).values({ conversationId: conversation.id, role: "assistant", content, status, citations });
    await db.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, conversation.id));
  };

  if (sources.length === 0) {
    async function* refusal(): AsyncGenerator<string, AnswerMeta> {
      await save(REFUSAL, "refused", []);
      yield REFUSAL;
      return { content: REFUSAL, status: "refused", citations: [] };
    }
    return { conversationId: conversation.id, sources: [], stream: refusal() };
  }

  const inner = ai.streamText({
    feature: asker.source === "widget" ? "widget_answer" : "answer",
    userId: asker.userId ?? undefined,
    messages: buildAnswerMessages(input.question, sources, history),
    maxOutputTokens: 350,
    temperature: 0, // deterministic decoding: same sources -> same answer
  });

  async function* answer(): AsyncGenerator<string, AnswerMeta> {
    let text = "";
    try {
      for await (const part of inner) {
        text += part;
        yield part;
      }
    } catch (err) {
      await save(text || "The answer was interrupted.", "error", []);
      throw err;
    }
    const refused = isRefusal(text);
    const { text: final, citations } = refused ? { text, citations: [] } : attributeCitations(text, sources);
    await save(final, refused ? "refused" : "ok", citations);
    return { content: final, status: refused ? "refused" : "ok", citations };
  }
  return { conversationId: conversation.id, sources: numbered, stream: answer() };
}

export async function listConversations(workspaceId: string, userId: string) {
  return db
    .select({ id: schema.conversations.id, title: schema.conversations.title, updatedAt: schema.conversations.updatedAt })
    .from(schema.conversations)
    .where(and(eq(schema.conversations.workspaceId, workspaceId), eq(schema.conversations.userId, userId), eq(schema.conversations.source, "app")))
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(50);
}

export async function getConversation(asker: Asker, id: string) {
  const conversation = await loadConversation(asker, id);
  const messages = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, id))
    .orderBy(asc(schema.messages.createdAt));
  return { conversation, messages };
}

export async function deleteConversation(asker: Asker, id: string) {
  await loadConversation(asker, id);
  await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
}
