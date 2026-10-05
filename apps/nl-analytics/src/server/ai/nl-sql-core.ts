import { z } from "zod";
import { fence, UNTRUSTED_NOTICE, type ChatMessage } from "@portfolio/ai";
import type { ChartSpec } from "@db/schema";
import { DATASET_NAME, schemaPrompt, TABLES } from "../sql/dataset";

export const MAX_QUESTION_CHARS = 500;
export const CHART_TYPES = ["bar", "line", "area", "pie", "number", "table"] as const;

/** What the model must return. An empty `sql` means "this can't be answered from the data". */
export const sqlAnswerSchema = z.object({
  sql: z.string().max(4000),
  title: z.string().min(1).max(100),
  chart: z.object({
    type: z.enum(CHART_TYPES),
    x: z.string().max(63).nullable(),
    y: z.array(z.string().max(63)).max(4),
  }),
  explanation: z.string().max(600),
});
export type SqlAnswer = z.infer<typeof sqlAnswerSchema>;

/** Lenient cleanup of small-model output before validation. */
export function normalizeAnswer(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = { ...(raw as Record<string, unknown>) };
  if (typeof o.sql === "string") o.sql = stripFences(o.sql);
  if (typeof o.title !== "string" || !o.title.trim()) o.title = "Query result";
  if (typeof o.explanation !== "string") o.explanation = "";
  const c = (o.chart && typeof o.chart === "object" ? { ...(o.chart as Record<string, unknown>) } : {}) as Record<string, unknown>;
  c.type = typeof c.type === "string" && (CHART_TYPES as readonly string[]).includes(c.type.toLowerCase()) ? c.type.toLowerCase() : "table";
  c.x = typeof c.x === "string" && c.x.trim() ? c.x.trim() : null;
  c.y = Array.isArray(c.y) ? c.y.filter((v) => typeof v === "string").slice(0, 4) : typeof c.y === "string" ? [c.y] : [];
  o.chart = c;
  return o;
}

/** Models often wrap SQL in ```sql fences. */
export function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:sql|postgresql)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

export function buildSqlMessages(question: string, today: string): ChatMessage[] {
  const system = `You write PostgreSQL queries for the ${DATASET_NAME} analytics dataset.
Tables (schema "demo"):
${schemaPrompt()}

Joins (these are the ONLY relationships; no other id columns exist):
  demo.orders.customer_id = demo.customers.id
  demo.customers.region_id = demo.regions.id
  demo.order_items.order_id = demo.orders.id
  demo.order_items.product_id = demo.products.id
  demo.support_tickets.customer_id = demo.customers.id
  demo.marketing_spend.channel matches demo.customers.acquisition_channel (text, not an id)

Rules:
- ALWAYS write SQL in "sql": ONE read-only SELECT (CTEs allowed), tables qualified with "demo.". Never modify data.
- Use only the tables and columns listed above. Give every output column a short unique snake_case alias.
- Revenue = sum(orders.total) for status = 'completed' unless the question says otherwise.
- Dates: today is ${today}; use CURRENT_DATE for relative periods ("last 30 days" -> order_date >= CURRENT_DATE - 30).
  For months use date_trunc('month', <date>)::date. Round money to 2 decimals.
- Rankings ("top", "best") need ORDER BY and LIMIT (10 if no number is given). Order time series by time.
- Do NOT add filters (dates, statuses, limits) the question doesn't ask for. "this year" means
  order_date >= date_trunc('year', CURRENT_DATE). "average" means avg(); "how many X" counts X rows.
- When the question lists categories ("completed, refunded and cancelled", "each channel"), GROUP BY that column.
- Only if the question is about something that is not in these tables at all (e.g. weather, employees), return
  "sql": "" and say why in "explanation".
Chart: "line" or "area" for a value over time (x = the date column), "bar" to compare categories, "pie" only for
shares of a whole with at most 6 slices, "number" for a single value, "table" otherwise. x and y must be output
column names; y are numeric columns.

Examples:
Q: Number of products in each category
{"sql": "SELECT category, count(*) AS products FROM demo.products GROUP BY category ORDER BY products DESC", "title": "Products per category", "chart": {"type": "bar", "x": "category", "y": ["products"]}, "explanation": "Counts products in each category."}
Q: Average discount per sales channel in the last 30 days
{"sql": "SELECT sales_channel, round(avg(discount_pct), 2) AS avg_discount FROM demo.orders WHERE order_date >= CURRENT_DATE - 30 GROUP BY sales_channel ORDER BY avg_discount DESC", "title": "Average discount by channel (30 days)", "chart": {"type": "bar", "x": "sales_channel", "y": ["avg_discount"]}, "explanation": "Averages the discount percentage of orders from the last 30 days for each sales channel."}

Return only JSON: {"sql": "...", "title": "short title", "chart": {"type": "...", "x": "...", "y": ["..."]}, "explanation": "one or two sentences on how the query answers the question"}.
${UNTRUSTED_NOTICE}`;
  return [
    { role: "system", content: system },
    { role: "user", content: `Question:\n${fence("question", question, MAX_QUESTION_CHARS)}\nReturn only the JSON object.` },
  ];
}

/** Follow-up turn when the SQL was rejected by the guard or failed in the database. */
/** Real columns of the dataset tables a failed query mentions (small models ignore the error text alone). */
export function columnsHint(sql: string): string {
  const lower = sql.toLowerCase();
  const used = TABLES.filter((t) => new RegExp(String.raw`\b${t.name}\b`).test(lower));
  return (used.length ? used : TABLES).map((t) => `demo.${t.name}: ${t.columns.map((c) => c.name).join(", ")}`).join("\n");
}

/** Follow-up turn when the SQL was rejected by the guard or failed in the database. */
export function repairMessages(base: ChatMessage[], previous: SqlAnswer, error: string): ChatMessage[] {
  return [
    ...base,
    { role: "assistant", content: JSON.stringify(previous) },
    {
      role: "user",
      content: `That SQL failed: ${error.slice(0, 400)}
The tables you used have ONLY these columns:
${columnsHint(previous.sql)}
Joins: orders.customer_id = customers.id; customers.region_id = regions.id; order_items.order_id = orders.id; order_items.product_id = products.id.
Fix the query (one SELECT, every table alias defined in FROM/JOIN, unique column aliases). Return the full JSON object again.`,
    },
  ];
}

export interface ResultShape {
  columns: { name: string; kind: "number" | "text" | "date" | "boolean" }[];
  rowCount: number;
}

/**
 * Keep the model's chart if it fits the actual result; otherwise choose one from the column types.
 * Never trusts column names the query didn't return.
 */
export function chooseChart(spec: SqlAnswer["chart"] | ChartSpec | null | undefined, result: ResultShape): ChartSpec {
  const names = new Set(result.columns.map((c) => c.name));
  const numeric = result.columns.filter((c) => c.kind === "number").map((c) => c.name);
  if (result.rowCount === 0) return { type: "table", x: null, y: [] };
  if (spec && spec.type !== "table") {
    const y = (spec.y ?? []).filter((n) => numeric.includes(n));
    if (spec.type === "number" && result.rowCount === 1 && (y[0] ?? numeric[0])) return { type: "number", x: null, y: [y[0] ?? numeric[0]!] };
    if (spec.type !== "number" && spec.x && names.has(spec.x) && y.length > 0 && !y.includes(spec.x)) {
      if (spec.type === "pie" && (result.rowCount > 8 || y.length > 1)) return { type: "bar", x: spec.x, y };
      return { type: spec.type, x: spec.x, y };
    }
  }
  return inferChart(result);
}

export function inferChart(result: ResultShape): ChartSpec {
  const numeric = result.columns.filter((c) => c.kind === "number");
  const date = result.columns.find((c) => c.kind === "date");
  const label = result.columns.find((c) => c.kind === "text");
  if (result.rowCount === 1 && result.columns.length === 1 && numeric.length === 1) return { type: "number", x: null, y: [numeric[0]!.name] };
  if (date && numeric.length) return { type: "line", x: date.name, y: numeric.filter((c) => c.name !== date.name).slice(0, 3).map((c) => c.name) };
  if (label && numeric.length && result.rowCount <= 30) return { type: "bar", x: label.name, y: numeric.slice(0, 2).map((c) => c.name) };
  return { type: "table", x: null, y: [] };
}

/* ------------------------------------------------------------- result summary */

export function buildSummaryMessages(question: string, result: { columns: { name: string }[]; rows: unknown[][]; truncated: boolean }): ChatMessage[] {
  const header = result.columns.map((c) => c.name).join(" | ");
  const lines = result.rows.slice(0, 40).map((r) => r.map((v) => (v === null ? "null" : String(v))).join(" | "));
  const system = `You summarize a query result for a business user in 2 to 4 short sentences.
Use ONLY numbers that appear in the result rows; copy them exactly (you may round to whole numbers).
Never invent trends, causes or numbers that are not in the rows. If the result is empty, say so. Plain text, no markdown.
${UNTRUSTED_NOTICE}`;
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `Question:\n${fence("question", question, MAX_QUESTION_CHARS)}\nResult (${result.rows.length}${result.truncated ? "+" : ""} rows${result.rows.length > 40 ? ", first 40 shown" : ""}):\n${fence("result", `${header}\n${lines.join("\n")}`, 6000)}\nWrite the summary.`,
    },
  ];
}

/** Numbers in the summary that aren't in the rows (allowing whole-number rounding). */
export function unverifiedNumbers(text: string, rows: unknown[][]): string[] {
  const allowed = new Set<string>();
  for (const row of rows.slice(0, 40))
    for (const v of row) {
      if (typeof v === "number") {
        allowed.add(String(v));
        allowed.add(String(Math.round(v)));
        allowed.add(v.toFixed(1));
        allowed.add(v.toFixed(2));
      } else if (v !== null) for (const m of String(v).matchAll(/\d+(?:\.\d+)?/g)) allowed.add(m[0]);
    }
  allowed.add(String(rows.length));
  const found = new Set<string>();
  for (const m of text.replace(/^\s*\d+[.)]\s/gm, "").matchAll(/\$?\d[\d,]*(?:\.\d+)?%?/g)) {
    const n = m[0].replace(/[$,%]/g, "");
    if (allowed.has(n) || allowed.has(String(Math.round(Number(n))))) continue;
    found.add(m[0]);
  }
  return [...found];
}
