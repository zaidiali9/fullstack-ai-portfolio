import { fence, UNTRUSTED_NOTICE, type ChatMessage } from "@portfolio/ai";

export interface ThreadMessage {
  authorName: string;
  fromCustomer: boolean;
  internal: boolean;
  body: string;
}

export interface KbSnippet {
  id: string;
  title: string;
  body: string;
}

const formatThread = (messages: ThreadMessage[]) =>
  messages
    .map((m) => `${m.fromCustomer ? "Customer" : "Agent"} (${m.authorName})${m.internal ? " [internal note]" : ""}:\n${m.body}`)
    .join("\n\n---\n\n");

/**
 * Draft reply grounded in KB articles. Internal notes are deliberately excluded: the draft is
 * customer-facing and must not leak agent-only information.
 */
export function buildDraftMessages(input: {
  orgName: string;
  agentName: string;
  subject: string;
  thread: ThreadMessage[];
  articles: KbSnippet[];
}): ChatMessage[] {
  const publicThread = input.thread.filter((m) => !m.internal).slice(-8);
  const kb = input.articles.length
    ? input.articles.map((a, i) => fence(`kb_article`, `[KB-${i + 1}] ${a.title}\n${a.body}`, 1500)).join("\n\n")
    : "(no relevant knowledge base articles were found)";
  const system = `You are a support agent at ${input.orgName}, writing a reply to the customer's latest message.
Rules:
- Use only facts from the knowledge base articles below. Cite them inline like [KB-1].
- If the articles don't answer the question, say you're checking with the team and ask one clarifying question.
- Never invent policies, prices, timelines, or promises.
- Be warm, concise and professional: at most 160 words, plain text, no subject line.
- Sign off as ${input.agentName}.
${UNTRUSTED_NOTICE}`;
  const lastCustomer = [...publicThread].reverse().find((m) => m.fromCustomer);
  // Small models follow instructions placed right next to the content best, so the task is restated last.
  const user = `Ticket subject: ${input.subject}

Conversation so far:
${fence("thread", formatThread(publicThread), 8000)}

Knowledge base articles:
${kb}

Task: reply to ${lastCustomer?.authorName ?? "the customer"}'s latest message. Do not ask for information they already gave (such as an order number in the conversation). If an article answers the question, state what will happen using that article and put its citation, e.g. [KB-1], right after the sentence. Reply text only.`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Agent-facing handover summary (agents only, so internal notes are included). */
export function buildSummaryMessages(input: { subject: string; thread: ThreadMessage[] }): ChatMessage[] {
  const system = `Summarize this support thread for an agent taking it over.
Write 3 to 5 short bullet points starting with "- ": the customer's problem, what has been tried, the current status, and the next step.
Only use facts from the thread; if something is unknown, say so. No preamble.
${UNTRUSTED_NOTICE}`;
  return [
    { role: "system", content: system },
    { role: "user", content: `Ticket subject: ${input.subject}\n\n${fence("thread", formatThread(input.thread.slice(-20)), 12000)}` },
  ];
}

/** Which [KB-n] markers did the model actually cite? Used to show sources next to the draft. */
export function citedArticleIndexes(text: string, articleCount: number): number[] {
  const seen = new Set<number>();
  for (const m of text.matchAll(/\[KB-(\d+)\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= articleCount) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}
