/**
 * Seed script: demo accounts, the fictional "Lanternfish Supply Co." dataset (SEED DATA, schema `demo`)
 * and an example dashboard built from HAND-WRITTEN SQL (labelled source "manual", not AI output).
 * Usage: npm run db:seed
 */
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { inArray, sql } from "drizzle-orm";
import { db, dbHandle, schema } from "@/db";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo";
import { seedDataset } from "./seed-data";

const USERS = [
  { key: "admin", name: "Rowan Ellis", email: DEMO_ACCOUNTS.admin.email, role: "admin" },
  { key: "analyst", name: "Sasha Ortiz", email: DEMO_ACCOUNTS.analyst.email, role: "analyst" },
] as const;

const EXAMPLES: { title: string; sql: string; chart: schema.ChartSpec; width: 1 | 2 }[] = [
  {
    title: "Monthly revenue (completed orders)",
    sql: `SELECT date_trunc('month', order_date)::date AS month, round(sum(total), 2) AS revenue
FROM demo.orders
WHERE status = 'completed'
GROUP BY 1
ORDER BY 1`,
    chart: { type: "line", x: "month", y: ["revenue"] },
    width: 2,
  },
  {
    title: "Revenue by region, last 90 days",
    sql: `SELECT r.name AS region, round(sum(o.total), 2) AS revenue
FROM demo.orders o
JOIN demo.customers c ON c.id = o.customer_id
JOIN demo.regions r ON r.id = c.region_id
WHERE o.status = 'completed' AND o.order_date >= current_date - 90
GROUP BY r.name
ORDER BY revenue DESC`,
    chart: { type: "bar", x: "region", y: ["revenue"] },
    width: 1,
  },
  {
    title: "Orders by sales channel",
    sql: `SELECT sales_channel, count(*) AS orders
FROM demo.orders
GROUP BY sales_channel
ORDER BY orders DESC`,
    chart: { type: "pie", x: "sales_channel", y: ["orders"] },
    width: 1,
  },
  {
    title: "Top 10 products by units sold",
    sql: `SELECT p.name AS product, sum(i.quantity) AS units
FROM demo.order_items i
JOIN demo.products p ON p.id = i.product_id
JOIN demo.orders o ON o.id = i.order_id
WHERE o.status = 'completed'
GROUP BY p.name
ORDER BY units DESC
LIMIT 10`,
    chart: { type: "bar", x: "product", y: ["units"] },
    width: 1,
  },
  {
    title: "Average support satisfaction",
    sql: `SELECT round(avg(satisfaction), 2) AS avg_satisfaction
FROM demo.support_tickets
WHERE satisfaction IS NOT NULL`,
    chart: { type: "number", x: null, y: ["avg_satisfaction"] },
    width: 1,
  },
];

async function main() {
  const t0 = Date.now();
  await db.delete(schema.user).where(inArray(schema.user.email, USERS.map((u) => u.email)));
  const hash = await hashPassword(DEMO_PASSWORD);
  const ids: Record<string, string> = {};
  for (const u of USERS) {
    const id = randomUUID();
    ids[u.key] = id;
    await db.insert(schema.user).values({ id, name: u.name, email: u.email, emailVerified: true, role: u.role });
    await db.insert(schema.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
  }

  const counts = await seedDataset(db, { today: new Date() });
  // New demo tables need the grant again on Postgres when the role was created before them.
  await db.execute(sql`GRANT SELECT ON ALL TABLES IN SCHEMA demo TO analytics_reader`);

  const saved = await db
    .insert(schema.savedQueries)
    .values(EXAMPLES.map((e) => ({ ownerId: ids.analyst!, title: e.title, question: "", sql: e.sql, chart: e.chart, source: "manual" })))
    .returning();
  const [dash] = await db
    .insert(schema.dashboards)
    .values({
      ownerId: ids.analyst!,
      title: "Sales overview (example)",
      description: "Example dashboard from hand-written SQL over the fictional seed dataset.",
      // Shared so the landing page can link to a public read-only example.
      shareToken: randomBytes(24).toString("base64url"),
    })
    .returning();
  await db.insert(schema.dashboardTiles).values(saved.map((q, i) => ({ dashboardId: dash!.id, queryId: q.id, position: i, width: EXAMPLES[i]!.width })));

  console.log(`Seeded ${USERS.length} users, dataset ${JSON.stringify(counts)}, ${saved.length} example queries, 1 dashboard in ${Date.now() - t0}ms`);
  console.log(`Demo logins (password "${DEMO_PASSWORD}"): ${Object.values(DEMO_ACCOUNTS).map((a) => a.email).join(", ")}`);
  await dbHandle().close();
}

main().catch(async (err) => {
  console.error(err);
  await dbHandle()
    .close()
    .catch(() => {});
  process.exit(1);
});
