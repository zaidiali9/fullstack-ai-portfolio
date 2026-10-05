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

/** One plain-English fact per line: small models copy these more faithfully than nested JSON. */
export function digestFacts(stats: DigestStats): string[] {
  const p = stats.past7;
  const n = stats.next7;
  const facts = [
    `Last 7 days: ${p.appointments} appointments.`,
    `Last 7 days: ${p.completed} completed.`,
    `Last 7 days: ${p.noShows} no-shows.`,
    `Last 7 days: ${p.cancellations} cancellations.`,
    `Last 7 days: booked value $${p.bookedValueUsd} (excluding no-shows).`,
  ];
  if (p.topService) facts.push(`Last 7 days: most booked service was ${p.topService.name} with ${p.topService.count} bookings.`);
  if (p.busiestDay) facts.push(`Last 7 days: busiest weekday was ${p.busiestDay.day} with ${p.busiestDay.count} appointments.`);
  facts.push(`Next 7 days: ${n.appointments} appointments booked so far.`);
  for (const s of n.byStaff) facts.push(`Next 7 days: ${s.name} has ${s.appointments} appointments, ${s.utilizationPct}% of working hours booked.`);
  if (n.quietestDay) facts.push(`Next 7 days: quietest open day is ${n.quietestDay.day} with ${n.quietestDay.appointments} booked.`);
  return facts;
}

export function buildDigestMessages(businessName: string, stats: DigestStats): ChatMessage[] {
  const system = `You write a short weekly schedule digest for the owner of ${businessName}, a wellness studio.
Rules:
- Use ONLY the facts provided. Copy numbers exactly as written. Never add, combine, total or estimate numbers.
- Keep "last 7 days" and "next 7 days" separate.
- Write 3 to 5 bullet points starting with "- ", then one line starting with "Suggestion:" with one practical idea
  (for example promoting the quietest day or following up on no-shows). At most 120 words.
- Plain text only: no headings, no bold, no markdown. Don't mention customer names.`;
  return [
    { role: "system", content: system },
    { role: "user", content: `Facts:\n${fence("facts", digestFacts(stats).map((f) => `- ${f}`).join("\n"), 4000)}\nWrite the digest.` },
  ];
}
