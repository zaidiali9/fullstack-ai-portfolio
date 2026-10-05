import { describe, expect, it } from "vitest";
import { guardSql, normalizeSql } from "@/server/sql/guard";

const allowed = [
  "SELECT count(*) FROM demo.orders",
  "select * from orders limit 5;",
  "SELECT date_trunc('month', order_date)::date AS month, round(sum(total), 2) AS revenue FROM demo.orders WHERE status = 'completed' GROUP BY 1 ORDER BY 1",
  "WITH t AS (SELECT customer_id, count(*) n FROM demo.orders GROUP BY 1) SELECT n, count(*) FROM t GROUP BY n ORDER BY n",
  "SELECT r.name, count(DISTINCT c.id) FROM demo.customers c JOIN demo.regions r ON r.id = c.region_id GROUP BY r.name",
  "SELECT extract(year FROM order_date) AS y, avg(total) FROM demo.orders GROUP BY 1",
  "SELECT * FROM demo.orders WHERE order_date >= current_date - interval '30 days'",
  "SELECT category, CASE WHEN sum(quantity) > 100 THEN 'high' ELSE 'low' END FROM demo.order_items i JOIN demo.products p ON p.id = i.product_id GROUP BY category",
  "SELECT id FROM demo.customers WHERE id IN (SELECT customer_id FROM demo.orders WHERE total > 500)",
  "SELECT sales_channel, rank() OVER (ORDER BY count(*) DESC) FROM demo.orders GROUP BY sales_channel",
  "SELECT coalesce(sum(spend), 0) FROM demo.marketing_spend WHERE channel = 'social'",
  "SELECT month FROM demo.marketing_spend UNION SELECT date_trunc('month', order_date)::date FROM demo.orders",
  "SELECT g::date FROM generate_series(current_date - 6, current_date, interval '1 day') AS g LEFT JOIN demo.orders o ON o.order_date = g::date",
  "SELECT avg(extract(epoch FROM resolved_at - opened_at) / 3600) FROM demo.support_tickets WHERE resolved_at IS NOT NULL",
  "SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY total) FROM demo.orders",
  "SELECT nullif(count(*), 0), greatest(1, 2) FROM demo.orders",
];

const rejected: [string, string][] = [
  ["", "empty"],
  ["DROP TABLE demo.orders", "not_select"],
  ["DELETE FROM demo.orders", "not_select"],
  ["UPDATE demo.orders SET total = 0", "not_select"],
  ["INSERT INTO demo.regions VALUES (9, 'x')", "not_select"],
  ["TRUNCATE demo.orders", "not_select"],
  ["SELECT 1; DROP TABLE demo.orders", "multiple_statements"],
  ["SELECT * FROM demo.orders; SELECT * FROM public.account", "multiple_statements"],
  ["WITH x AS (DELETE FROM demo.orders RETURNING *) SELECT * FROM x", "not_select"],
  ["SELECT * INTO demo.copy FROM demo.orders", "clause"],
  ["SELECT * FROM demo.orders FOR UPDATE", "clause"],
  ["SELECT * FROM public.account", "table"],
  ['SELECT password FROM "account"', "table"],
  ["SELECT * FROM \"user\"", "table"],
  ["SELECT * FROM pg_catalog.pg_authid", "table"],
  ["SELECT * FROM pg_shadow", "table"],
  ["SELECT * FROM pg_settings", "table"],
  ["SELECT * FROM information_schema.tables", "table"],
  ["SELECT * FROM otherdb.demo.orders", "table"],
  ["SELECT * FROM pg_settings, (WITH pg_settings AS (SELECT 1) SELECT * FROM pg_settings) s", "table"],
  ["SELECT pg_sleep(10) FROM demo.orders", "function"],
  ["SELECT pg_read_file('/etc/passwd') FROM demo.orders", "function"],
  ["SELECT set_config('role', 'postgres', false) FROM demo.orders", "function"],
  ["SELECT current_setting('data_directory') FROM demo.orders", "function"],
  ["SELECT query_to_xml('select * from account', true, true, '') FROM demo.orders", "function"],
  ["SELECT dblink('host=evil', 'select 1') FROM demo.orders", "function"],
  ["SELECT public.my_func() FROM demo.orders", "function"],
  ["SELECT 'pg_authid'::regclass FROM demo.orders", "type"],
  ["SELECT 1::oid FROM demo.orders", "type"],
  ["SELECT current_user FROM demo.orders", "value"],
  ["SELECT session_user FROM demo.orders", "value"],
  ["SELECT * FROM demo.orders WHERE id = $1", "node"],
  ["SELECT * FROM demo.orders TABLESAMPLE SYSTEM (10)", "node"],
  ["SELECT xmlelement(name x) FROM demo.orders", "node"],
  ["COPY demo.orders TO '/tmp/x'", "not_select"],
  ["SET ROLE postgres", "not_select"],
  ["EXPLAIN ANALYZE DELETE FROM demo.orders", "not_select"],
  ["SELECT 1", "table"],
  ["SELECT 1 FROM demo.orders UNION SELECT password FROM public.account", "table"],
  ["SELECT id FROM demo.orders UNION ALL SELECT pg_sleep(5)::int FROM demo.orders", "function"],
  ["SELECT id FROM demo.orders UNION SELECT id FROM demo.orders FOR UPDATE", "clause"],
  ["SELECT * FROM demo.orders o WHERE EXISTS (SELECT 1 FROM pg_user)", "table"],
  ["SELECT (SELECT rolname FROM pg_roles LIMIT 1) FROM demo.orders", "table"],
  ["SELECT count(*) OVER (ORDER BY pg_backend_pid()) FROM demo.orders", "function"],
  ["SELEC * FROM demo.orders", "syntax"],
  ["SELECT * FROM demo.orders /* unterminated", "syntax"],
  ["x".repeat(4001), "too_long"],
];

describe("SQL guard (real PostgreSQL parser)", () => {
  it.each(allowed)("allows: %s", async (sql) => {
    const r = await guardSql(sql);
    expect(r).toMatchObject({ ok: true });
  });

  it.each(rejected)("rejects: %s", async (sql, code) => {
    const r = await guardSql(sql);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(code);
      expect(r.reason.length).toBeGreaterThan(5);
    }
  });

  it("reports which dataset tables a query reads, excluding CTE names", async () => {
    const r = await guardSql("WITH t AS (SELECT * FROM demo.orders) SELECT * FROM t JOIN products p ON true");
    expect(r).toEqual({ ok: true, sql: expect.any(String), tables: ["orders", "products"] });
  });

  it("normalizes trailing semicolons and whitespace only", () => {
    expect(normalizeSql("  select 1 ;; \n")).toBe("select 1");
    expect(normalizeSql("select ';' ")).toBe("select ';'");
  });
});
