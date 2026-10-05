import { ACQ_CHANNELS, CATEGORIES, ORDER_STATUSES, REGIONS, SALES_CHANNELS, SEGMENTS, TICKET_CATEGORIES } from "@db/seed-data";

/**
 * Description of the demo dataset given to the model, and the source of the guard's table allowlist.
 * SEED DATA: "Lanternfish Supply Co." is fictional.
 */
export interface ColumnInfo {
  name: string;
  type: string;
  note?: string;
}
export interface TableInfo {
  name: string;
  description: string;
  columns: ColumnInfo[];
}

const list = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(", ");

export const DATASET_SCHEMA = "demo";
export const DATASET_NAME = "Lanternfish Supply Co. (fictional online retailer)";

export const TABLES: TableInfo[] = [
  { name: "regions", description: "Sales regions", columns: [{ name: "id", type: "smallint" }, { name: "name", type: "text", note: `one of ${list(REGIONS)}` }] },
  {
    name: "customers",
    description: "One row per customer account (no names or contact details)",
    columns: [
      { name: "id", type: "integer" },
      { name: "region_id", type: "smallint", note: "→ regions.id" },
      { name: "signup_date", type: "date" },
      { name: "segment", type: "text", note: list(SEGMENTS) },
      { name: "acquisition_channel", type: "text", note: list(ACQ_CHANNELS) },
    ],
  },
  {
    name: "products",
    description: "Product catalog",
    columns: [
      { name: "id", type: "integer" },
      { name: "name", type: "text" },
      { name: "category", type: "text", note: list(CATEGORIES) },
      { name: "unit_price", type: "numeric", note: "list price in USD" },
      { name: "unit_cost", type: "numeric", note: "cost in USD" },
      { name: "launched_on", type: "date" },
    ],
  },
  {
    name: "orders",
    description: "One row per order",
    columns: [
      { name: "id", type: "integer" },
      { name: "customer_id", type: "integer", note: "→ customers.id" },
      { name: "order_date", type: "date" },
      { name: "status", type: "text", note: `${list(ORDER_STATUSES)}; revenue normally counts only 'completed'` },
      { name: "sales_channel", type: "text", note: list(SALES_CHANNELS) },
      { name: "discount_pct", type: "numeric", note: "0-25" },
      { name: "total", type: "numeric", note: "order value in USD after discount" },
    ],
  },
  {
    name: "order_items",
    description: "Order lines",
    columns: [
      { name: "id", type: "integer" },
      { name: "order_id", type: "integer", note: "→ orders.id" },
      { name: "product_id", type: "integer", note: "→ products.id" },
      { name: "quantity", type: "smallint" },
      { name: "unit_price", type: "numeric", note: "price per unit before order discount" },
    ],
  },
  {
    name: "marketing_spend",
    description: "Monthly marketing spend per acquisition channel",
    columns: [
      { name: "month", type: "date", note: "first day of the month" },
      { name: "channel", type: "text", note: `${list(ACQ_CHANNELS)} (matches customers.acquisition_channel)` },
      { name: "spend", type: "numeric", note: "USD" },
    ],
  },
  {
    name: "support_tickets",
    description: "Customer support tickets",
    columns: [
      { name: "id", type: "integer" },
      { name: "customer_id", type: "integer", note: "→ customers.id" },
      { name: "opened_at", type: "timestamptz" },
      { name: "category", type: "text", note: list(TICKET_CATEGORIES) },
      { name: "resolved_at", type: "timestamptz", note: "null while open" },
      { name: "satisfaction", type: "smallint", note: "1-5, null if not rated" },
    ],
  },
];

export const TABLE_NAMES = new Set(TABLES.map((t) => t.name));

/** Compact schema text for the prompt. */
export function schemaPrompt(): string {
  return TABLES.map(
    (t) => `${DATASET_SCHEMA}.${t.name} — ${t.description}\n${t.columns.map((c) => `  ${c.name} ${c.type}${c.note ? ` (${c.note})` : ""}`).join("\n")}`,
  ).join("\n\n");
}
