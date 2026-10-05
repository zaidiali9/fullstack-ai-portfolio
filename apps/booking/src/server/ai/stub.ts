import { createStubChatProvider } from "@portfolio/ai/testing";

/**
 * Deterministic STUB for E2E tests (AI_PROVIDER=stub): keyword rules, provider name "stub", and
 * text output prefixed "[stub]". Never used for evals, screenshots of AI features, or metrics.
 */
export function createBookingStub() {
  return createStubChatProvider((req) => {
    const system = req.messages[0]?.content ?? "";
    const text = (req.messages[1]?.content ?? "").toLowerCase();
    if (system.includes("search filters")) {
      const service = /facial|skin/.test(text) ? "signature-facial" : /deep|knot|sore/.test(text) ? "deep-tissue-massage" : /massage/.test(text) ? "swedish-massage" : null;
      const staff = /priya/.test(text) ? "Priya" : /sam\b/.test(text) ? "Sam" : null;
      const timeOfDay = /morning/.test(text) ? "morning" : /afternoon/.test(text) ? "afternoon" : /evening|after work/.test(text) ? "evening" : "any";
      return JSON.stringify({ service, staff, timeOfDay, after: null, before: null });
    }
    return "- [stub] Weekly digest placeholder used in automated tests.\nSuggestion: [stub] none.";
  });
}
