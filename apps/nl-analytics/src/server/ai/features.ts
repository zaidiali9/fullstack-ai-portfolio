import "server-only";
import { z } from "zod";
import { AIError, aiUnavailable } from "@portfolio/ai";
import { enforceRateLimit, HttpError } from "@portfolio/kit";
import type { ChartSpec } from "@db/schema";
import { db } from "@/db";
import { getAI } from "@/lib/ai";
import { env } from "@/lib/env";
import type { AppUser } from "../access";
import { runReadOnly, type QueryResult, type RunSource } from "../sql/execute";
import { buildSqlMessages, buildSummaryMessages, chooseChart, MAX_QUESTION_CHARS, normalizeAnswer, repairMessages, sqlAnswerSchema, unverifiedNumbers, type SqlAnswer } from "./nl-sql-core";

export const askInput = z.object({
  question: z.string().trim().min(3, "Ask a question about the data.").max(MAX_QUESTION_CHARS, `Keep questions under ${MAX_QUESTION_CHARS} characters.`),
});

/** Model attempts per question: the first answer plus up to two repair turns with the error. */
export const MAX_SQL_ATTEMPTS = 3;

interface AskBase {
  question: string;
  title: string;
  sql: string;
  explanation: string;
  attempts: number;
  model: { provider: string; model: string };
}
export type AskResult = (AskBase & { ok: true; chart: ChartSpec; result: QueryResult }) | (AskBase & { ok: false; code: string; error: string });

async function enforceAiRate(userId: string) {
  await enforceRateLimit(db, `ai:${userId}`, { limit: env().AI_USER_PER_MINUTE, windowMs: 60_000, message: "You're asking questions too quickly. Please wait a minute." });
}

/**
 * Question -> SQL -> guarded read-only execution -> chart. If the guard or the database rejects the
 * SQL, the error goes back to the model for a repair turn. Model output is never executed without
 * passing the guard; the final SQL is always returned so the user can see and edit it.
 */
export async function askQuestion(user: AppUser, raw: unknown, opts: { source?: RunSource } = {}): Promise<AskResult> {
  const { question } = askInput.parse(raw);
  await enforceAiRate(user.id);
  const ai = getAI();
  if (!ai.status().chat.available) throw aiUnavailable();
  const base = buildSqlMessages(question, new Date().toISOString().slice(0, 10));
  const call = (messages: typeof base) =>
    ai.generateObject({ feature: "nl_sql", userId: user.id, schema: sqlAnswerSchema, prepare: normalizeAnswer, messages, maxOutputTokens: 500, temperature: 0 });

  const status = ai.status().chat;
  const failed = (attempts: number, err: AIError): AskResult => ({
    question,
    title: "No answer",
    sql: "",
    explanation: "",
    attempts,
    model: { provider: status.provider ?? "unknown", model: status.model ?? "unknown" },
    ok: false,
    code: `ai_${err.code}`,
    error: "The AI couldn't produce a usable query for this question. Try rephrasing it, or write the SQL yourself.",
  });
  let res: Awaited<ReturnType<typeof call>>;
  try {
    res = await call(base);
  } catch (err) {
    if (err instanceof AIError && err.code === "invalid_output") return failed(1, err);
    throw err;
  }
  let answer: SqlAnswer = res.object;
  for (let attempt = 1; ; attempt++) {
    const common = { question, title: answer.title, sql: answer.sql, explanation: answer.explanation, attempts: attempt, model: { provider: res.provider, model: res.model } };
    if (!answer.sql.trim()) {
      // The app states what happened; the model's own words are quoted, never presented as fact
      // (in the eval, a model claimed a table "was successfully dropped" when nothing had run).
      const note = answer.explanation.trim().slice(0, 300);
      return {
        ...common,
        explanation: "",
        ok: false,
        code: "unanswerable",
        error: `No query was run: the AI didn't write SQL for this question.${note ? ` Its note: “${note}”` : ""}`,
      };
    }
    try {
      const result = await runReadOnly(answer.sql, { userId: user.id, source: opts.source ?? "ai", question });
      return { ...common, sql: result.sql, ok: true, chart: chooseChart(answer.chart, result), result };
    } catch (err) {
      if (!(err instanceof HttpError) || err.status !== 422) throw err;
      if (attempt >= MAX_SQL_ATTEMPTS) return { ...common, ok: false, code: err.code, error: err.message };
      try {
        res = await call(repairMessages(base, answer, err.message));
      } catch (repairErr) {
        // Keep the last real SQL and its error so the user can fix it by hand.
        if (repairErr instanceof AIError && repairErr.code === "invalid_output") return { ...common, ok: false, code: err.code, error: err.message };
        throw repairErr;
      }
      answer = res.object;
    }
  }
}

/* ------------------------------------------------------------------ run SQL by hand */

export const runInput = z.object({
  sql: z.string().min(1, "Write a query.").max(4000),
  question: z.string().max(MAX_QUESTION_CHARS).optional(),
  chart: z
    .object({ type: z.enum(["bar", "line", "area", "pie", "number", "table"]), x: z.string().max(63).nullable().optional(), y: z.array(z.string().max(63)).max(4).optional() })
    .optional(),
});

export async function enforceQueryRate(key: string) {
  await enforceRateLimit(db, `q:${key}`, { limit: env().QUERIES_PER_MINUTE, windowMs: 60_000, message: "Too many queries. Please wait a minute." });
}

/** Hand-written or edited SQL: the same guard and execution path as model SQL. */
export async function runManual(user: AppUser, raw: unknown) {
  const input = runInput.parse(raw);
  await enforceQueryRate(user.id);
  const result = await runReadOnly(input.sql, { userId: user.id, source: "manual", question: input.question });
  return { result, chart: chooseChart(input.chart ? { type: input.chart.type, x: input.chart.x ?? null, y: input.chart.y ?? [] } : null, result) };
}

/* ------------------------------------------------------------------ result summary */

export const summaryInput = z.object({ question: z.string().trim().min(1).max(MAX_QUESTION_CHARS), sql: z.string().min(1).max(4000) });

/**
 * Streamed plain-language summary of a result. The query is re-run on the server (client-sent rows
 * are never trusted); numbers in the summary that don't appear in the rows are listed in the trailer.
 */
export async function streamSummary(user: AppUser, raw: unknown) {
  const input = summaryInput.parse(raw);
  await enforceAiRate(user.id);
  const ai = getAI();
  if (!ai.status().chat.available) throw aiUnavailable();
  const result = await runReadOnly(input.sql, { userId: user.id, source: "ai", question: input.question });
  const gen = ai.streamText({ feature: "summary", userId: user.id, messages: buildSummaryMessages(input.question, result), maxOutputTokens: 220, temperature: 0.2 });
  async function* withCheck(): AsyncGenerator<string, unknown> {
    let text = "";
    let r = await gen.next();
    while (!r.done) {
      text += r.value;
      yield r.value;
      r = await gen.next();
    }
    return { unverified: unverifiedNumbers(text, result.rows), provider: r.value.provider, model: r.value.model };
  }
  return withCheck();
}
