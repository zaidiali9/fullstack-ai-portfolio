import "server-only";
import { asc, eq } from "drizzle-orm";
import { AIError, looksLikeInjection } from "@portfolio/ai";
import { HttpError } from "@portfolio/kit";
import { db, schema } from "@/db";
import { getAI } from "@/lib/ai";
import { audit } from "../audit";
import type { OrgContext } from "../authz";
import { retrieveArticles, type RetrievedArticle } from "../kb";
import { getTicketByNumber } from "../tickets";
import { enforceOrgQuota } from "./quota";
import { buildDraftMessages, buildSummaryMessages, type ThreadMessage } from "./reply-core";
import { buildTriageMessages, normalizeTriage, triageSchema } from "./triage-core";

/**
 * Classify a ticket with the configured model and store the result. Runs after the create
 * response is sent. Never throws: failures are recorded on the ticket so the UI can show
 * "AI unavailable" or "Triage failed" instead of fake values.
 */
export async function runTriage(ticketId: string, opts: { actorId?: string } = {}) {
  const [row] = await db
    .select({ ticket: schema.tickets, org: schema.organizations })
    .from(schema.tickets)
    .innerJoin(schema.organizations, eq(schema.tickets.orgId, schema.organizations.id))
    .where(eq(schema.tickets.id, ticketId))
    .limit(1);
  if (!row) return;
  const { ticket, org } = row;
  const ai = getAI({ orgId: org.id });
  if (!ai.status().chat.available) {
    await db.update(schema.tickets).set({ triageStatus: "unavailable" }).where(eq(schema.tickets.id, ticketId));
    return;
  }
  try {
    await enforceOrgQuota(org);
  } catch {
    await db.update(schema.tickets).set({ triageStatus: "unavailable" }).where(eq(schema.tickets.id, ticketId));
    return;
  }
  const [first] = await db
    .select({ body: schema.ticketMessages.body })
    .from(schema.ticketMessages)
    .where(eq(schema.ticketMessages.ticketId, ticketId))
    .orderBy(asc(schema.ticketMessages.createdAt))
    .limit(1);
  try {
    const result = await ai.generateObject({
      feature: "triage",
      userId: opts.actorId,
      schema: triageSchema,
      prepare: normalizeTriage,
      messages: buildTriageMessages(ticket.subject, first?.body ?? ""),
      maxOutputTokens: 120,
    });
    const t = result.object;
    await db.transaction(async (tx) => {
      await tx
        .update(schema.tickets)
        .set({ category: t.category, priority: t.priority, sentiment: t.sentiment, aiSummary: t.summary, triageStatus: "done", triagedAt: new Date() })
        .where(eq(schema.tickets.id, ticketId));
      await audit(tx, {
        orgId: org.id,
        actorId: opts.actorId ?? null,
        action: "ticket.triaged",
        targetType: "ticket",
        targetId: ticketId,
        meta: { number: ticket.number, ...t, model: result.model, provider: result.provider, possibleInjection: looksLikeInjection(first?.body ?? "") },
      });
    });
  } catch (err) {
    const code = err instanceof AIError ? err.code : "error";
    console.warn(`[triage] ticket ${ticketId} failed: ${code}`, err instanceof AIError ? err.detail : err);
    await db.update(schema.tickets).set({ triageStatus: code === "unavailable" ? "unavailable" : "failed" }).where(eq(schema.tickets.id, ticketId));
  }
}

async function threadFor(ctx: OrgContext, number: number) {
  const data = await getTicketByNumber(ctx, number);
  const thread: ThreadMessage[] = data.messages.map((m): ThreadMessage => ({ authorName: m.authorName, fromCustomer: m.fromCustomer, internal: m.internal, body: m.body }));
  return { ...data, thread };
}

function requireChat(ctx: OrgContext) {
  const ai = getAI({ orgId: ctx.org.id });
  if (!ai.status().chat.available) throw new AIError("unavailable", "AI unavailable: no AI provider is configured on this server.", { retryable: false });
  return ai;
}

/** Streamed reply draft grounded in the org's KB. Returns the generator plus the sources used. */
export async function draftReply(ctx: OrgContext, number: number) {
  const ai = requireChat(ctx);
  const { ticket, thread } = await threadFor(ctx, number);
  const lastCustomer = [...thread].reverse().find((m) => m.fromCustomer && !m.internal);
  if (!lastCustomer) throw new HttpError(400, "nothing_to_reply", "There is no customer message to reply to yet.");
  const articles: RetrievedArticle[] = await retrieveArticles(ctx.org.id, `${ticket.subject}\n${lastCustomer.body}`, 3);
  const messages = buildDraftMessages({ orgName: ctx.org.name, agentName: ctx.user.name, subject: ticket.subject, thread, articles });
  const stream = ai.streamText({ feature: "draft_reply", userId: ctx.user.id, messages, maxOutputTokens: 350, temperature: 0.3 });
  return { stream, sources: articles.map((a, i) => ({ ref: `KB-${i + 1}`, id: a.id, title: a.title, method: a.method })) };
}

export async function summarizeThread(ctx: OrgContext, number: number) {
  const ai = requireChat(ctx);
  const { ticket, thread } = await threadFor(ctx, number);
  return ai.streamText({ feature: "summarize", userId: ctx.user.id, messages: buildSummaryMessages({ subject: ticket.subject, thread }), maxOutputTokens: 250 });
}
