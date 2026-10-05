/**
 * SEED DATA generator for the demo dataset: "Lanternfish Supply Co.", a FICTIONAL online retailer.
 * Every customer, product, order, ticket and spend figure is synthetic (deterministic PRNG). Customers
 * have no names or contact details — only ids, region, segment and acquisition channel.
 */
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import type { Database } from "@portfolio/kit/db";

type DB = Database<typeof schema>;

export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const REGIONS = ["North America", "Europe", "Asia Pacific", "Latin America"] as const;
export const SEGMENTS = ["consumer", "small_business", "enterprise"] as const;
export const ACQ_CHANNELS = ["organic", "paid_search", "social", "referral", "email"] as const;
export const SALES_CHANNELS = ["web", "mobile", "marketplace"] as const;
export const ORDER_STATUSES = ["completed", "refunded", "cancelled"] as const;
export const TICKET_CATEGORIES = ["shipping", "returns", "product_question", "billing"] as const;
export const CATEGORIES = ["Camping", "Kitchen", "Apparel", "Home", "Bags"] as const;

const PRODUCT_NAMES: Record<(typeof CATEGORIES)[number], string[]> = {
  Camping: ["Ridgeline Tent 2P", "Ember Camp Stove", "Trailhead Headlamp", "Basin Water Filter", "Summit Sleeping Bag", "Canyon Camp Chair", "Lumen Lantern", "Switchback Trekking Poles"],
  Kitchen: ["Stoneware Mug", "Pour-Over Kettle", "Cast Iron Skillet 10in", "Linen Tea Towels", "Maple Cutting Board", "Enamel Camp Mug", "French Press 1L", "Spice Tin Set"],
  Apparel: ["Merino Base Layer", "Packable Rain Jacket", "Wool Hiking Socks", "Canvas Work Shirt", "Fleece Quarter-Zip", "Sun Hat", "Down Vest", "Trail Running Shorts"],
  Home: ["Beeswax Candle", "Wool Throw Blanket", "Ceramic Planter", "Linen Pillow Cover", "Brass Desk Lamp", "Cedar Storage Box", "Woven Basket", "Recycled Glass Vase"],
  Bags: ["Daypack 22L", "Waxed Canvas Tote", "Rolltop Dry Bag", "Duffel 40L", "Hip Pack", "Laptop Sleeve", "Travel Cube Set", "Sling Bag"],
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export interface DatasetCounts {
  regions: number;
  products: number;
  customers: number;
  orders: number;
  orderItems: number;
  marketingSpend: number;
  supportTickets: number;
}

/**
 * Build the dataset in memory: 24 full months before `today` plus the current month to date.
 * Deterministic for a given seed and `today`.
 */
export function generateDataset(opts: { today: Date; seed?: number; customers?: number }) {
  const rand = prng(opts.seed ?? 7);
  const pick = <T,>(items: readonly T[], weights: number[]) => {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    for (let i = 0; i < items.length; i++) if ((r -= weights[i]!) < 0) return items[i]!;
    return items[items.length - 1]!;
  };
  const today = new Date(Date.UTC(opts.today.getUTCFullYear(), opts.today.getUTCMonth(), opts.today.getUTCDate()));
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 24, 1));
  const spanDays = Math.round((today.getTime() - start.getTime()) / 86_400_000);

  const regions = REGIONS.map((name, i) => ({ id: i + 1, name }));

  const products: (typeof schema.products.$inferInsert)[] = [];
  let pid = 1;
  for (const category of CATEGORIES) {
    for (const name of PRODUCT_NAMES[category]) {
      const base = { Camping: 90, Kitchen: 32, Apparel: 60, Home: 45, Bags: 70 }[category];
      const price = Math.max(9, Math.round(base * (0.4 + rand() * 1.6))) - 0.01;
      // A few products launch during the period, so "new products" questions have answers.
      const launched = rand() < 0.2 ? addDays(start, Math.floor(rand() * spanDays * 0.8)) : addDays(start, -Math.floor(rand() * 400) - 30);
      products.push({ id: pid++, name, category, unitPrice: money(price), unitCost: money(price * (0.35 + rand() * 0.25)), launchedOn: iso(launched) });
    }
  }
  const popularity = products.map(() => 0.3 + rand() * 1.7);

  const nCustomers = opts.customers ?? 2500;
  const customers: (typeof schema.customers.$inferInsert)[] = [];
  for (let id = 1; id <= nCustomers; id++) {
    // Growth: later signups are more likely (sqrt skews toward the end of the period).
    const day = Math.floor(Math.sqrt(rand()) * spanDays);
    customers.push({
      id,
      regionId: pick([1, 2, 3, 4], [45, 30, 17, 8]),
      signupDate: iso(addDays(start, day)),
      segment: pick(SEGMENTS, [80, 15, 5]),
      acquisitionChannel: pick(ACQ_CHANNELS, [35, 25, 20, 12, 8]),
    });
  }

  const orders: (typeof schema.orders.$inferInsert)[] = [];
  const items: (typeof schema.orderItems.$inferInsert)[] = [];
  const tickets: (typeof schema.supportTickets.$inferInsert)[] = [];
  let oid = 1;
  let iid = 1;
  let tid = 1;
  const seasonal = (d: Date) => {
    const m = d.getUTCMonth();
    return m === 10 || m === 11 ? 1.7 : m >= 4 && m <= 7 ? 1.25 : 1;
  };
  for (const c of customers) {
    const signup = new Date(`${c.signupDate}T00:00:00Z`);
    const rate = { consumer: 1 / 75, small_business: 1 / 40, enterprise: 1 / 20 }[c.segment as (typeof SEGMENTS)[number]];
    let d = signup;
    // First purchase within two weeks of sign-up for most customers.
    d = addDays(d, Math.floor(rand() * 14));
    while (d <= today) {
      if (rand() < Math.min(0.95, 0.6 * seasonal(d))) {
        const promo = d.getUTCMonth() === 10 && d.getUTCDate() >= 20;
        const discount = promo ? pick([0, 10, 20, 25], [30, 20, 20, 30]) : pick([0, 10, 20], [72, 20, 8]);
        const status = pick(ORDER_STATUSES, [90, 6, 4]);
        const lines = 1 + Math.floor(rand() * rand() * 4);
        let gross = 0;
        const used = new Set<number>();
        for (let l = 0; l < lines; l++) {
          const p = pick(products, popularity);
          if (p.launchedOn > iso(d) || used.has(p.id!)) continue;
          used.add(p.id!);
          const qty = c.segment === "enterprise" ? 2 + Math.floor(rand() * 8) : 1 + Math.floor(rand() * rand() * 3);
          gross += qty * Number(p.unitPrice);
          items.push({ id: iid++, orderId: oid, productId: p.id!, quantity: qty, unitPrice: p.unitPrice });
        }
        if (used.size > 0) {
          orders.push({
            id: oid,
            customerId: c.id!,
            orderDate: iso(d),
            status,
            salesChannel: pick(SALES_CHANNELS, [55, 35, 10]),
            discountPct: discount.toFixed(1),
            total: money(gross * (1 - discount / 100)),
          });
          if (rand() < 0.12) {
            const opened = new Date(d.getTime() + Math.floor(rand() * 10 * 86_400_000) + Math.floor(rand() * 86_400_000));
            if (opened < opts.today) {
              const hours = Math.round(1 + rand() * rand() * 120);
              const resolved = rand() < 0.93 ? new Date(opened.getTime() + hours * 3_600_000) : null;
              const resolvedInPast = resolved && resolved < opts.today ? resolved : null;
              tickets.push({
                id: tid++,
                customerId: c.id!,
                openedAt: opened,
                category: pick(TICKET_CATEGORIES, status === "refunded" ? [10, 70, 10, 10] : [40, 15, 30, 15]),
                resolvedAt: resolvedInPast,
                satisfaction: resolvedInPast ? Math.max(1, Math.min(5, Math.round(5.2 - hours / 30 - rand() * 1.5))) : null,
              });
            }
          }
          oid++;
        }
      }
      d = addDays(d, Math.max(1, Math.round(-Math.log(1 - rand()) / rate)));
    }
  }

  const spend: (typeof schema.marketingSpend.$inferInsert)[] = [];
  for (let m = 0; m <= 24; m++) {
    const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 1));
    const growth = 1 + m * 0.03;
    for (const [ch, base] of [
      ["paid_search", 9000],
      ["social", 6000],
      ["email", 1200],
      ["referral", 2000],
      ["organic", 1500],
    ] as const) {
      spend.push({ month: iso(month), channel: ch, spend: money(base * growth * seasonal(month) * (0.85 + rand() * 0.3)) });
    }
  }

  return { regions, products, customers, orders, items, tickets, spend };
}

async function insertBatched<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>, size = 1000) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

/** Replace the demo dataset. */
export async function seedDataset(db: DB, opts: { today: Date; seed?: number; customers?: number }): Promise<DatasetCounts> {
  const d = generateDataset(opts);
  await db.delete(schema.supportTickets);
  await db.delete(schema.orderItems);
  await db.delete(schema.orders);
  await db.delete(schema.marketingSpend);
  await db.delete(schema.customers);
  await db.delete(schema.products);
  await db.delete(schema.regions);
  await db.insert(schema.regions).values(d.regions);
  await db.insert(schema.products).values(d.products);
  await insertBatched(d.customers, (b) => db.insert(schema.customers).values(b));
  await insertBatched(d.orders, (b) => db.insert(schema.orders).values(b));
  await insertBatched(d.items, (b) => db.insert(schema.orderItems).values(b));
  await insertBatched(d.tickets, (b) => db.insert(schema.supportTickets).values(b));
  await db.insert(schema.marketingSpend).values(d.spend);
  // Fresh planner statistics: the executor's EXPLAIN cost ceiling depends on realistic estimates.
  for (const t of ["regions", "products", "customers", "orders", "order_items", "marketing_spend", "support_tickets"]) {
    await db.execute(sql.raw(`ANALYZE demo.${t}`));
  }
  return {
    regions: d.regions.length,
    products: d.products.length,
    customers: d.customers.length,
    orders: d.orders.length,
    orderItems: d.items.length,
    marketingSpend: d.spend.length,
    supportTickets: d.tickets.length,
  };
}
