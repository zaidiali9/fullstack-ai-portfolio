import { z } from "zod";
import { fence, UNTRUSTED_NOTICE, type ChatMessage } from "@portfolio/ai";
import { addDays, parseDate, weekdayOf, type DateStr } from "../scheduling/time";

/* ------------------------------------------------------- date resolution
 * Dates are resolved deterministically, not by the model: small models are unreliable at calendar
 * arithmetic, and a wrong date silently books the wrong day. The resolved range is shown to the user.
 */

export interface DateRange {
  from: DateStr;
  to: DateStr;
  label: string;
}

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_RE = "(sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const NUM_WORDS: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, fourteen: 14 };

const weekdayIndex = (w: string) => WEEKDAY_NAMES.findIndex((n) => n.startsWith(w.slice(0, 3)));
const monthIndex = (m: string) => MONTHS.indexOf(m.slice(0, 3));
const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): DateStr | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Next date (today or later) with this month/day; rolls to next year if already past. */
function upcoming(today: DateStr, month: number, day: number): DateStr | null {
  const { y } = parseDate(today);
  const thisYear = validDate(y, month, day);
  if (thisYear && thisYear >= today) return thisYear;
  return validDate(y + 1, month, day);
}

/** Monday-based week start. */
const weekStart = (d: DateStr) => addDays(d, -((weekdayOf(d) + 6) % 7));

const single = (d: DateStr, label: string): DateRange => ({ from: d, to: d, label });

/**
 * Resolve a date expression in free text relative to `today` (business timezone).
 * Conventions (shown back to the user, see DECISIONS.md): weeks start on Monday; a bare or "this"
 * weekday is its next occurrence including today; "next <weekday>" is that weekday in next week.
 */
export function resolveDates(text: string, today: DateStr): DateRange | null {
  const t = ` ${text.toLowerCase().replace(/[,.!?]/g, " ").replace(/\s+/g, " ")} `;
  let m: RegExpMatchArray | null;

  if (/\bday after tomorrow\b/.test(t)) return single(addDays(today, 2), "day after tomorrow");
  if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(t)) return single(today, "today");
  if (/\b(tomorrow|tmrw|tmr)\b/.test(t)) return single(addDays(today, 1), "tomorrow");

  if ((m = t.match(/\bin (\d{1,2}|a|one|two|three|four|five|six|seven|ten|fourteen) (day|week)s?\b/))) {
    const n = Number(m[1]) || NUM_WORDS[m[1]!] || 1;
    return single(addDays(today, m[2] === "week" ? n * 7 : n), `in ${n} ${m[2]}${n > 1 ? "s" : ""}`);
  }

  // ISO 2026-10-14
  if ((m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) {
    const d = validDate(Number(m[1]), Number(m[2]), Number(m[3]));
    if (d) return single(d, d);
  }
  // "october 14", "oct 14th"
  if ((m = t.match(new RegExp(`\\b${MONTH_RE} (\\d{1,2})(?:st|nd|rd|th)?\\b`)))) {
    const d = upcoming(today, monthIndex(m[1]!) + 1, Number(m[2]));
    if (d) return single(d, d);
  }
  // "14 october", "the 14th of october"
  if ((m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${MONTH_RE}\\b`)))) {
    const d = upcoming(today, monthIndex(m[2]!) + 1, Number(m[1]));
    if (d) return single(d, d);
  }
  // US numeric "10/14"
  if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})\b/))) {
    const d = upcoming(today, Number(m[1]), Number(m[2]));
    if (d) return single(d, d);
  }
  // "the 14th" (this month, or next month if already past)
  if ((m = t.match(/\b(?:the |on )(\d{1,2})(st|nd|rd|th)\b/))) {
    const day = Number(m[1]);
    const { y, m: mo } = parseDate(today);
    let d = validDate(y, mo, day);
    if (!d || d < today) d = mo === 12 ? validDate(y + 1, 1, day) : validDate(y, mo + 1, day);
    if (d) return single(d, d);
  }

  if ((m = t.match(new RegExp(`\\bnext ${WEEKDAY_RE}\\b`)))) {
    const wd = weekdayIndex(m[1]!);
    const d = addDays(weekStart(today), 7 + ((wd + 6) % 7));
    return single(d, `next ${WEEKDAY_NAMES[wd]}`);
  }
  if ((m = t.match(new RegExp(`\\b${WEEKDAY_RE}s?\\b`)))) {
    const wd = weekdayIndex(m[1]!);
    const diff = (wd - weekdayOf(today) + 7) % 7;
    return single(addDays(today, diff), WEEKDAY_NAMES[wd]!);
  }

  if (/\bnext weekend\b/.test(t)) {
    const sat = addDays(weekStart(today), 12);
    return { from: sat, to: addDays(sat, 1), label: "next weekend" };
  }
  if (/\b(this )?weekend\b/.test(t)) {
    const sat = addDays(weekStart(today), 5);
    return { from: sat < today ? today : sat, to: addDays(sat, 1), label: "this weekend" };
  }
  if (/\bnext week\b/.test(t)) {
    const mon = addDays(weekStart(today), 7);
    return { from: mon, to: addDays(mon, 6), label: "next week" };
  }
  if (/\b(this|rest of the) week\b/.test(t)) return { from: today, to: addDays(weekStart(today), 6), label: "this week" };
  if (/\bnext month\b/.test(t)) {
    const { y, m: mo } = parseDate(today);
    const first = mo === 12 ? `${y + 1}-01-01` : `${y}-${pad(mo + 1)}-01`;
    const nextFirst = mo === 11 ? `${y + 1}-01-01` : mo === 12 ? `${y + 1}-02-01` : `${y}-${pad(mo + 2)}-01`;
    return { from: first, to: addDays(nextFirst, -1), label: "next month" };
  }
  if (/\b(asap|as soon as possible|soonest|earliest|first available)\b/.test(t)) return { from: today, to: addDays(today, 6), label: "as soon as possible" };
  return null;
}

/* ---------------------------------------------------------- model extraction */

export const TIME_OF_DAY = ["morning", "afternoon", "evening", "any"] as const;
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export const nlRequestSchema = z.object({
  service: z.string().nullable().describe("slug of the matching service from the list, or null"),
  staff: z.string().nullable().describe("first name of the requested staff member from the list, or null"),
  timeOfDay: z.enum(TIME_OF_DAY),
  after: z.string().regex(HHMM).nullable().describe("earliest start time, 24h HH:MM, or null"),
  before: z.string().regex(HHMM).nullable().describe("latest start time, 24h HH:MM, or null"),
});
export type NlRequest = z.infer<typeof nlRequestSchema>;

export interface CatalogForPrompt {
  services: { slug: string; name: string; description: string; durationMin: number }[];
  staff: { name: string; title: string }[];
}

/** Lenient pre-validation cleanup of small-model output (case, "none" strings, 12h times). */
export function normalizeNl(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = { ...(raw as Record<string, unknown>) };
  const nullish = (v: unknown) => v === undefined || v === "" || (typeof v === "string" && /^(null|none|any|n\/a|unknown)$/i.test(v.trim()));
  for (const k of ["service", "staff", "after", "before"]) if (nullish(o[k])) o[k] = null;
  if (typeof o.service === "string") o.service = o.service.trim().toLowerCase().replace(/\s+/g, "-");
  if (typeof o.timeOfDay === "string") o.timeOfDay = o.timeOfDay.trim().toLowerCase();
  if (o.timeOfDay === undefined || o.timeOfDay === null || o.timeOfDay === "") o.timeOfDay = "any";
  for (const k of ["after", "before"]) {
    const v = o[k];
    if (typeof v === "string") o[k] = to24h(v);
    else if (typeof v === "number" && v >= 0 && v < 24) o[k] = `${pad(v)}:00`;
  }
  return o;
}

export function to24h(v: string): string | null {
  const m = v.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3]?.startsWith("p") && h < 12) h += 12;
  if (m[3]?.startsWith("a") && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

export function buildNlMessages(catalog: CatalogForPrompt, request: string): ChatMessage[] {
  const services = catalog.services.map((s) => `- ${s.slug}: ${s.name} (${s.durationMin} min) — ${s.description}`).join("\n");
  const staff = catalog.staff.map((s) => `- ${s.name.split(" ")[0]} (${s.title})`).join("\n");
  const system = `You turn a customer's booking request into search filters for a wellness studio's calendar.
You only extract preferences; you never book anything and never invent availability.
Services (slug: name — description):
${services}
Staff:
${staff}
Return JSON with:
- "service": the slug of the single best-matching service, or null if the request doesn't say what they want
- "staff": the staff member's first name if they asked for a specific person, else null
- "timeOfDay": "morning" (before 12:00), "afternoon" (12:00-17:00), "evening" (after 17:00) or "any"
- "after" / "before": explicit start-time limits in 24h "HH:MM" (e.g. "after 3pm" -> after "15:00"), else null
Ignore dates; they are handled separately.
${UNTRUSTED_NOTICE}`;
  return [
    { role: "system", content: system },
    { role: "user", content: `Customer request:\n${fence("request", request, 600)}\nReturn only the JSON object.` },
  ];
}

/** Map validated model output onto known catalog entries; unknown values become null with a note. */
export function resolveNl<S extends { slug: string; id: string; staffIds: string[]; name: string }, P extends { id: string; name: string }>(
  parsed: NlRequest,
  services: S[],
  staff: P[],
): { service: S | null; staffMember: P | null; notes: string[] } {
  const notes: string[] = [];
  const service = parsed.service ? (services.find((s) => s.slug === parsed.service) ?? null) : null;
  let staffMember: P | null = null;
  if (parsed.staff) {
    const q = parsed.staff.trim().toLowerCase();
    staffMember = staff.find((p) => p.name.toLowerCase() === q || p.name.toLowerCase().split(" ")[0] === q) ?? null;
    if (!staffMember) notes.push(`We couldn't find a team member called "${parsed.staff.slice(0, 40)}", so we searched everyone.`);
  }
  if (service && staffMember && !service.staffIds.includes(staffMember.id)) {
    notes.push(`${staffMember.name.split(" ")[0]} doesn't offer ${service.name}, so we searched everyone who does.`);
    staffMember = null;
  }
  return { service, staffMember, notes };
}

/** Local-time start window from the parsed preference (minutes from midnight). */
export function timeWindow(p: Pick<NlRequest, "timeOfDay" | "after" | "before">): { fromMin: number; toMin: number } | null {
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const tod = { morning: [0, 12 * 60], afternoon: [12 * 60, 17 * 60], evening: [17 * 60, 24 * 60], any: [0, 24 * 60] }[p.timeOfDay];
  // An explicit time replaces the matching time-of-day bound ("after 4pm" is not "after 5pm" just
  // because the model also said "evening").
  const from = p.after ? toMin(p.after) : tod[0]!;
  let to = p.before ? toMin(p.before) : tod[1]!;
  if (from >= to) to = 24 * 60; // contradictory ("morning after 3pm"): trust the explicit time
  if (from === 0 && to === 24 * 60) return null;
  return { fromMin: from, toMin: to };
}
