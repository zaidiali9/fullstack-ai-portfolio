import { HttpError } from "@portfolio/kit";

export interface ExtractedPage {
  /** 1-based page number for PDFs; null for formats without pages. */
  page: number | null;
  text: string;
}

export interface Extracted {
  pages: ExtractedPage[];
  pageCount: number | null;
  title?: string;
}

/** Extract plain text from a supported document. Parsers are imported lazily (they are large). */
export async function extractText(buf: Buffer, mimeType: string): Promise<Extracted> {
  if (mimeType === "application/pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { totalPages, text } = await pdfText(pdf, { mergePages: false });
    const pages = (text as string[]).map((t, i) => ({ page: i + 1, text: t }));
    return { pages, pageCount: totalPages };
  }
  if (mimeType.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { pages: [{ page: null, text: value }], pageCount: null };
  }
  if (mimeType === "text/html") {
    return htmlToText(buf.toString("utf8"));
  }
  if (mimeType === "text/markdown" || mimeType === "text/plain") {
    return { pages: [{ page: null, text: buf.toString("utf8") }], pageCount: null };
  }
  throw new HttpError(415, "unsupported_type", "Unsupported document type.");
}

/** Readable text from an HTML page: drops scripts, styles and page chrome; keeps headings as Markdown. */
export async function htmlToText(html: string): Promise<Extracted> {
  const { parse } = await import("node-html-parser");
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false, pre: true } });
  const title = root.querySelector("title")?.text.trim();
  root.querySelectorAll("script,style,noscript,nav,footer,header,aside,form,svg,iframe").forEach((n) => n.remove());
  const main = root.querySelector("main") ?? root.querySelector("article") ?? root.querySelector("body") ?? root;
  main.querySelectorAll("h1,h2,h3,h4").forEach((h) => {
    const level = Number(h.tagName.slice(1));
    h.set_content(`\n\n${"#".repeat(level)} ${h.text.trim()}\n\n`);
  });
  main.querySelectorAll("p,li,div,section,br,tr").forEach((n) => n.insertAdjacentHTML("afterend", "\n"));
  const text = main.text
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
  return { pages: [{ page: null, text }], pageCount: null, title: title?.slice(0, 160) };
}
