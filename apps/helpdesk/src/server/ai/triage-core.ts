import { fence, stripInjection, UNTRUSTED_NOTICE, type ChatMessage } from "@portfolio/ai";
import { z } from "zod";

export const CATEGORIES = ["billing", "technical", "account", "other"] as const;
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const SENTIMENTS = ["negative", "neutral", "positive"] as const;

export const triageSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  sentiment: z.enum(SENTIMENTS),
  summary: z.string().trim().min(3).max(240),
});
export type Triage = z.infer<typeof triageSchema>;

const SYNONYMS: Record<string, string> = {
  payment: "billing",
  payments: "billing",
  invoice: "billing",
  refund: "billing",
  bug: "technical",
  tech: "technical",
  "technical issue": "technical",
  login: "account",
  "account access": "account",
  general: "other",
  critical: "urgent",
  normal: "medium",
  negative: "negative",
  angry: "negative",
  frustrated: "negative",
  happy: "positive",
};

/**
 * Small open models sometimes answer "Billing", "billing|technical" or synonyms. Normalize
 * obvious variants before strict validation; anything still invalid triggers a repair turn.
 */
export function normalizeTriage(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  for (const key of ["category", "priority", "sentiment"] as const) {
    const v = out[key];
    if (typeof v !== "string") continue;
    let s = v.trim().toLowerCase();
    if (s.includes("|")) continue; // copied the option list -> leave invalid so the model is asked again
    s = SYNONYMS[s] ?? s;
    out[key] = s;
  }
  if (typeof out.summary === "string") out.summary = out.summary.trim().slice(0, 240);
  return out;
}

// Few-shot examples (written for this prompt; distinct from the eval set in scripts/eval-triage.ts).
const EXAMPLES: { subject: string; body: string; answer: Triage }[] = [
  {
    subject: "Locked out after enabling 2FA",
    body: "I turned on two-factor auth and lost my phone. Now I can't sign in at all. How do I get back into my account?",
    answer: { category: "account", priority: "high", sentiment: "neutral", summary: "Customer lost their 2FA device and cannot sign in." },
  },
  {
    subject: "Refund for annual plan",
    body: "We upgraded to the annual plan by mistake yesterday. Could you refund it and move us back to monthly? Thanks!",
    answer: { category: "billing", priority: "medium", sentiment: "positive", summary: "Customer wants a refund for an accidental annual upgrade." },
  },
  {
    subject: "Webhooks failing with 500",
    body: "Since this morning every webhook delivery to our endpoint fails and orders are not syncing. Our whole store is affected!!",
    answer: { category: "technical", priority: "urgent", sentiment: "negative", summary: "All webhook deliveries fail, blocking order sync for the store." },
  },
];

export const TRIAGE_SYSTEM = `You are a support ticket triage assistant. Classify each ticket.

category (exactly one):
- billing: payments, charges, invoices, refunds, subscriptions, plans, pricing, VAT/tax
- technical: bugs, errors, crashes, outages, slowness, integrations, API, webhooks, data sync
- account: sign-in, passwords, 2FA, email/username changes, profile, user access and permissions
- other: anything else (general questions, feedback, sales, partnerships)

priority (exactly one):
- urgent: production down, security or data-loss issue, or many users blocked
- high: a customer is blocked, cannot sign in, or was charged incorrectly
- medium: a problem with a workaround, or a change request
- low: a question, suggestion or minor cosmetic issue

sentiment: negative, neutral or positive, judged from the customer's tone.
summary: one sentence (at most 20 words) describing the request for an agent.

Reply with only JSON: {"category": "...", "priority": "...", "sentiment": "...", "summary": "..."}

${UNTRUSTED_NOTICE}`;

const ticketText = (subject: string, body: string) => fence("ticket", `Subject: ${subject}\n\n${body}`, 4000);

/**
 * Prompt-injection defense in layers: (1) sentences that look like instructions to the AI are
 * removed, (2) the rest is fenced as untrusted data, (3) the output is schema-validated and
 * (4) `guardTriage` refuses automatic "urgent" when injection text was detected.
 */
export function prepareTicketForTriage(subject: string, body: string) {
  const s = stripInjection(subject);
  const b = stripInjection(body);
  return { subject: s.text || "(no subject)", body: b.text || "(empty)", injectionDetected: s.removed + b.removed > 0 };
}

export function buildTriageMessages(subject: string, body: string): ChatMessage[] {
  const clean = prepareTicketForTriage(subject, body);
  const shots: ChatMessage[] = EXAMPLES.flatMap((ex) => [
    { role: "user" as const, content: ticketText(ex.subject, ex.body) },
    { role: "assistant" as const, content: JSON.stringify(ex.answer) },
  ]);
  return [{ role: "system", content: TRIAGE_SYSTEM }, ...shots, { role: "user", content: ticketText(clean.subject, clean.body) }];
}

/** Deterministic post-check: a ticket containing injection-like text never gets auto-escalated to urgent. */
export function guardTriage(t: Triage, injectionDetected: boolean): Triage {
  return injectionDetected && t.priority === "urgent" ? { ...t, priority: "high" } : t;
}
