import { fence, type ChatMessage } from "@portfolio/ai";

export interface DigestStats {
  period: { from: string; to: string };
  past7: {
    appointments: number;
    completed: number;
    noShows: number;
    cancellations: number;
    bookedValueUsd: number;
    topService: { name: string; count: number } | null;
    busiestDay: { day: string; count: number } | null;
  };
  next7: {
    appointments: number;
    byStaff: { name: string; appointments: number; utilizationPct: number }[];
    quietestDay: { day: string; appointments: number } | null;
  };
}

/** The narrative may only restate numbers that appear somewhere in the stats (values, dates, labels). */
export function allowedNumbers(stats: DigestStats): Set<string> {
  const nums = new Set<string>(["7"]);
  for (const m of JSON.stringify(stats).matchAll(/\d+(?:\.\d+)?/g)) {
    nums.add(m[0]);
    nums.add(String(Math.round(Number(m[0]))));
  }
  return nums;
}

/**
 * Numbers in the narrative that don't appear in the stats — shown to the owner as a warning so a
 * model slip is visible instead of trusted. Numbered-list markers ("1. ") are ignored.
 */
export function unverifiedNumbers(text: string, stats: DigestStats): string[] {
  const allowed = allowedNumbers(stats);
  const found = new Set<string>();
  for (const m of text.replace(/^\s*\d+[.)]\s/gm, "").matchAll(/\$?\d[\d,]*(?:\.\d+)?%?/g)) {
    const raw = m[0];
    const n = raw.replace(/[$,%]/g, "");
    const value = Number(n);
    if (Number.isNaN(value)) continue;
    if (allowed.has(n) || allowed.has(String(Math.round(value)))) continue;
    found.add(raw);
  }
  return [...found];
}

export function buildDigestMessages(businessName: string, stats: DigestStats): ChatMessage[] {
  const system = `You write a short weekly schedule digest for the owner of ${businessName}, a wellness studio.
Rules:
- Use ONLY the numbers in the JSON stats. Never calculate new numbers, estimate, or invent facts.
- Write 3 to 5 bullet points starting with "- ", then one line starting with "Suggestion:" with a practical idea
  (for example promoting the quietest day or following up on no-shows). At most 140 words. Plain text, no headings.
- If a number is 0, say so plainly. Don't mention customer names.`;
  return [
    { role: "system", content: system },
    { role: "user", content: `Stats for the week:\n${fence("stats", JSON.stringify(stats, null, 2), 4000)}\nWrite the digest.` },
  ];
}
