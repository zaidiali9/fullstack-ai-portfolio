import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { HttpError } from "@portfolio/kit";
import { rowsOf } from "@portfolio/kit/db";
import { db, schema } from "@/db";
import { readerRoleUsable, runReadOnly } from "@/server/sql/execute";
import { seedDataset } from "@db/seed-data";

const ctx = { userId: null, source: "manual" as const };

async function expectHttp(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpError);
  expect((err as HttpError).code).toBe(code);
  return err as HttpError;
}

beforeAll(async () => {
  await seedDataset(db, { today: new Date("2026-10-05T12:00:00Z"), customers: 300 });
});

describe("runReadOnly", () => {
  it("returns typed columns and converted values", async () => {
    const r = await runReadOnly(
      "SELECT date_trunc('month', order_date)::date AS month, count(*) AS orders, round(sum(total), 2) AS revenue, bool_or(discount_pct > 0) AS any_discount FROM demo.orders GROUP BY 1 ORDER BY 1",
      ctx,
    );
    expect(r.columns).toEqual([
      { name: "month", kind: "date" },
      { name: "orders", kind: "number" },
      { name: "revenue", kind: "number" },
      { name: "any_discount", kind: "boolean" },
    ]);
    expect(r.rows[0]![0]).toMatch(/^\d{4}-\d{2}-01$/);
    expect(typeof r.rows[0]![1]).toBe("number");
    expect(typeof r.rows[0]![2]).toBe("number");
    expect(r.tables).toEqual(["orders"]);
    expect(r.truncated).toBe(false);
  });

  it("caps rows and reports truncation", async () => {
    const r = await runReadOnly("SELECT o.id, r.id AS region FROM demo.orders o CROSS JOIN demo.regions r", ctx);
    expect(r.rowCount).toBe(1000);
    expect(r.truncated).toBe(true);
  });

  it("rejects unsafe SQL before it reaches the database, and audits the attempt", async () => {
    const err = await expectHttp(runReadOnly("DELETE FROM demo.orders", { ...ctx, question: "delete everything" }), "sql_rejected");
    expect(err.status).toBe(422);
    const [last] = await db.select().from(schema.queryRuns).orderBy(sql`created_at desc`).limit(1);
    expect(last).toMatchObject({ status: "rejected", question: "delete everything", sql: "DELETE FROM demo.orders" });
    const [{ n }] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from demo.orders`));
    expect(n).toBeGreaterThan(0);
  });

  it("returns the database's error for broken queries", async () => {
    const err = await expectHttp(runReadOnly("SELECT revenue FROM demo.orders", ctx), "sql_error");
    expect(err.message).toContain('column "revenue" does not exist');
  });

  it("refuses queries whose estimated cost is above the ceiling", async () => {
    await expectHttp(runReadOnly("SELECT count(*) FROM demo.order_items a, demo.order_items b, demo.orders c", ctx), "sql_too_expensive");
  });

  it("asks for unique column names", async () => {
    await expectHttp(runReadOnly("SELECT count(*), count(*) FROM demo.orders", ctx), "sql_duplicate_columns");
  });

  it("resolves unqualified dataset tables through search_path = demo", async () => {
    const r = await runReadOnly("SELECT count(*) AS n FROM regions", ctx);
    expect(r.rows).toEqual([[4]]);
  });
});

describe("database layers behind the guard", () => {
  it("the analytics_reader role is usable and can't read app tables or write", async () => {
    expect(await readerRoleUsable()).toBe(true);
    const attempt = (stmt: string) =>
      db
        .transaction(async (tx) => {
          await tx.execute(sql.raw("SET TRANSACTION READ ONLY"));
          await tx.execute(sql.raw("SET LOCAL ROLE analytics_reader"));
          return tx.execute(sql.raw(stmt));
        })
        .then(
          () => "ok",
          (e: unknown) => String((e as { cause?: { message?: string }; message?: string }).cause?.message ?? (e as Error).message),
        );
    expect(await attempt("select count(*) from demo.orders")).toBe("ok");
    expect(await attempt("select password from public.account")).toMatch(/permission denied/);
    expect(await attempt('select email from public."user"')).toMatch(/permission denied/);
    expect(await attempt("insert into demo.regions values (99, 'x')")).toMatch(/read-only transaction/);
  });
});
