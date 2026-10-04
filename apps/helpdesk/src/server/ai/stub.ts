import { createStubChatProvider } from "@portfolio/ai/testing";

/**
 * Deterministic STUB for E2E tests (AI_PROVIDER=stub). Keyword rules, clearly labeled "[stub]".
 * Never used for evals, screenshots of AI features, or metrics.
 */
export function createHelpdeskStub() {
  return createStubChatProvider((req) => {
    const system = req.messages[0]?.content ?? "";
    const text = req.messages.map((m) => m.content).join("\n").toLowerCase();
    if (system.includes("triage")) {
      const category = /charge|invoice|refund|billing|payment/.test(text) ? "billing" : /login|password|account/.test(text) ? "account" : /error|crash|bug|api/.test(text) ? "technical" : "other";
      return JSON.stringify({ category, priority: /urgent|down|asap/.test(text) ? "urgent" : "medium", sentiment: /angry|terrible|!/.test(text) ? "negative" : "neutral", summary: "[stub] Customer request summary" });
    }
    if (system.includes("Summarize")) return "- [stub] Summary of the thread\n- [stub] Next step: reply to the customer";
    return "[stub] Thanks for reaching out — this is a stubbed draft reply used in automated tests. [KB-1]";
  });
}
