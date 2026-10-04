import type { ExtractedPage } from "./extract";

export interface TextChunk {
  content: string;
  page: number | null;
  heading: string | null;
}

export interface ChunkOptions {
  /** Target maximum characters per chunk (~200 tokens for MiniLM's 256-token window). */
  maxChars: number;
  /** Characters of trailing context repeated at the start of the next chunk. */
  overlapChars: number;
}

const DEFAULTS: ChunkOptions = { maxChars: 900, overlapChars: 150 };

const normalize = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/-\n(?=[a-z])/g, "") // join words hyphenated across PDF line breaks
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Split an over-long paragraph on sentence boundaries (hard-split only if a sentence is too long). */
export function splitLong(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph];
  const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [paragraph];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && (cur + s).length > maxChars) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > maxChars) {
      for (let i = 0; i < s.length; i += maxChars) out.push(s.slice(i, i + maxChars).trim());
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Last ~n characters, starting at a sentence (or word) boundary. */
function overlapTail(text: string, n: number): string {
  if (n <= 0) return "";
  if (text.length <= n) return text;
  const cut = text.slice(-n);
  const sentence = cut.search(/[.!?]\s+\S/);
  if (sentence >= 0) return cut.slice(sentence + 1).trim();
  return cut.replace(/^\S*\s/, "").trim();
}

/**
 * Split extracted pages into overlapping chunks along paragraph boundaries. Markdown headings are
 * tracked and prefixed to each chunk ("Heading — text") so short chunks keep their context.
 * Chunks never cross page boundaries, so every citation can name a page.
 */
export function chunkPages(pages: ExtractedPage[], opts: Partial<ChunkOptions> = {}): TextChunk[] {
  const { maxChars, overlapChars } = { ...DEFAULTS, ...opts };
  const chunks: TextChunk[] = [];
  let heading: string | null = null;

  for (const page of pages) {
    let parts: string[] = [];
    let hasNew = false;
    const emit = () => {
      const body = parts.join("\n\n").trim();
      if (hasNew && body.length >= 20) chunks.push({ content: heading ? `${heading} — ${body}` : body, page: page.page, heading });
      const carry = hasNew ? overlapTail(body, overlapChars) : "";
      parts = carry ? [carry] : [];
      hasNew = false;
    };
    const paragraphs = normalize(page.text)
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
      .filter(Boolean);
    for (const para of paragraphs) {
      const h = /^#{1,6}\s+(.+)$/.exec(para);
      if (h) {
        emit();
        parts = []; // don't carry text across sections
        heading = h[1]!.trim().slice(0, 120);
        continue;
      }
      for (const piece of splitLong(para, maxChars)) {
        const len = parts.reduce((n, p) => n + p.length + 2, 0);
        if (hasNew && len + piece.length > maxChars) emit();
        parts.push(piece);
        hasNew = true;
      }
    }
    emit();
  }
  return chunks;
}
