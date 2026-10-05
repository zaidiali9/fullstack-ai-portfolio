import { createStubChatProvider } from "@portfolio/ai/testing";

/**
 * Deterministic STUB for E2E tests (AI_PROVIDER=stub): keyword rules, provider name "stub", titles and
 * text labelled "[stub]". Never used for evals, screenshots of AI features, or metrics.
 */
export function createAnalyticsStub() {
  return createStubChatProvider((req) => {
    const system = req.messages[0]?.content ?? "";
    const q = (req.messages[1]?.content ?? "").toLowerCase();
    if (system.includes("You write PostgreSQL queries")) {
      if (/drop|delete|password/.test(q)) {
        return JSON.stringify({ sql: "DROP TABLE demo.orders", title: "[stub] unsafe", chart: { type: "table", x: null, y: [] }, explanation: "[stub]" });
      }
      if (/region/.test(q)) {
        return JSON.stringify({
          sql: "SELECT r.name AS region, round(sum(o.total), 2) AS revenue FROM demo.orders o JOIN demo.customers c ON c.id = o.customer_id JOIN demo.regions r ON r.id = c.region_id WHERE o.status = 'completed' GROUP BY r.name ORDER BY revenue DESC",
          title: "[stub] Revenue by region",
          chart: { type: "bar", x: "region", y: ["revenue"] },
          explanation: "[stub] Sums completed order totals per region.",
        });
      }
      if (/weather/.test(q)) return JSON.stringify({ sql: "", title: "[stub] Not in the data", chart: { type: "table", x: null, y: [] }, explanation: "[stub] The dataset has no weather data." });
      return JSON.stringify({
        sql: "SELECT date_trunc('month', order_date)::date AS month, round(sum(total), 2) AS revenue FROM demo.orders WHERE status = 'completed' GROUP BY 1 ORDER BY 1",
        title: "[stub] Monthly revenue",
        chart: { type: "line", x: "month", y: ["revenue"] },
        explanation: "[stub] Sums completed order totals per month.",
      });
    }
    return "[stub] Summary placeholder used in automated tests.";
  });
}
