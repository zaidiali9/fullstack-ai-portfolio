/**
 * Pull the first JSON object/array out of model text. Handles ```json fences, leading prose and
 * trailing commentary, which small open models often add despite instructions.
 */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [fenced?.[1], text].filter((c): c is string => typeof c === "string");
  for (const candidate of candidates) {
    const slice = firstBalanced(candidate);
    if (slice === null) continue;
    try {
      return JSON.parse(slice);
    } catch {
      try {
        return JSON.parse(slice.replace(/,\s*([}\]])/g, "$1")); // trailing commas
      } catch {
        /* try next candidate */
      }
    }
  }
  throw new SyntaxError("No JSON value found in model output");
}

/** Return the first balanced {...} or [...] substring, respecting string literals. */
export function firstBalanced(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start < 0) return null;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      if (stack.pop() !== ch) return null;
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
