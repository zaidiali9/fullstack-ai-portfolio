import { fence, stripInjection, UNTRUSTED_NOTICE, type ChatMessage } from "@portfolio/ai";
import { z } from "zod";

const BANNED = [
  { re: /[$€£]\s?\d|\b\d+(\.\d{2})?\s?(usd|dollars?)\b/i, msg: "Do not mention prices." },
  { re: /\b(free shipping|ships? free|in stock|discount|sale|% off)\b/i, msg: "Do not mention shipping, stock or discounts." },
  { re: /\b(best|perfect|revolutionary|world[- ]class|ultimate|award[- ]winning)\b/i, msg: 'Remove superlatives such as "best", "perfect", "ultimate" or "award-winning".' },
];

/**
 * Structured draft returned to the admin editor (never saved without a human edit/approve step).
 * Content rules live in the schema so a violating answer triggers a repair turn that quotes them.
 */
export const descriptionSchema = z
  .object({
    description: z.string().trim().min(60, "Description is too short").max(1200, "Description is too long"),
    highlights: z.array(z.string().trim().min(3).max(90)).min(2).max(5),
  })
  .superRefine((d, ctx) => {
    const text = `${d.description} ${d.highlights.join(" ")}`;
    for (const b of BANNED) if (b.re.test(text)) ctx.addIssue({ code: "custom", message: b.msg, path: ["description"] });
  });
export type DescriptionDraft = z.infer<typeof descriptionSchema>;

export interface DescriptionInput {
  name: string;
  category: string;
  attributes: Record<string, string>;
  /** Optional free-text notes from the admin (e.g. "aimed at campers"). */
  notes?: string;
}

export const DESCRIPTION_SYSTEM = `You write product descriptions for Fernwood Supply, an online store for practical home and outdoor goods.
Write in a warm, plain, confident tone for shoppers.
Rules:
- Use ONLY the facts given in the product details. Do not invent materials, sizes, certifications, awards, warranties or origins.
- Never mention prices, discounts, shipping or stock.
- No superlatives like "best", "perfect" or "revolutionary".
- description: 2 short paragraphs, 60 to 140 words in total.
- highlights: 3 to 5 short phrases (under 12 words each), one per given fact.
Reply with only JSON: {"description": "...", "highlights": ["...", "..."]}
${UNTRUSTED_NOTICE}`;

export function buildDescriptionMessages(input: DescriptionInput): ChatMessage[] {
  const attrs = Object.entries(input.attributes)
    .map(([k, v]) => `- ${stripInjection(k).text}: ${stripInjection(v).text}`)
    .join("\n");
  const notes = input.notes ? stripInjection(input.notes).text : "";
  const details = `Name: ${stripInjection(input.name).text}\nCategory: ${input.category}\nFacts:\n${attrs || "- (none given)"}${notes ? `\nNotes from the store: ${notes}` : ""}`;
  return [
    { role: "system", content: DESCRIPTION_SYSTEM },
    { role: "user", content: `Product details:\n${fence("product", details, 3000)}\n\nWrite the JSON now.` },
  ];
}

/** Deterministic post-checks the eval also uses: things the model must not add. */
export function draftProblems(draft: DescriptionDraft): string[] {
  const text = `${draft.description} ${draft.highlights.join(" ")}`;
  const problems: string[] = [];
  if (/[$€£]\s?\d|\b\d+(\.\d{2})?\s?(usd|dollars?)\b/i.test(text)) problems.push("mentions a price");
  if (/\b(free shipping|in stock|discount|sale)\b/i.test(text)) problems.push("mentions shipping, stock or discounts");
  if (/\b(best|perfect|revolutionary|world[- ]class)\b/i.test(text)) problems.push("uses a banned superlative");
  const words = draft.description.split(/\s+/).filter(Boolean).length;
  if (words > 170) problems.push(`too long (${words} words)`);
  if (words < 30) problems.push(`short (${words} words) — consider adding detail`);
  return problems;
}
