import { HttpError } from "@portfolio/kit";

export type SupportedType = "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "text/markdown" | "text/plain";

const EXT: Record<string, SupportedType> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
};

export const ACCEPT_ATTR = ".pdf,.docx,.md,.markdown,.txt";

const startsWith = (buf: Buffer, sig: number[]) => sig.every((b, i) => buf[i] === b);

/**
 * Decide the real file type from its content (magic bytes), not the browser-supplied MIME type,
 * and require the extension to agree. Rejects executables renamed to .pdf, binary blobs as .txt, etc.
 */
export function detectFileType(fileName: string, buf: Buffer, maxBytes: number): SupportedType {
  if (buf.length === 0) throw new HttpError(400, "empty_file", "The file is empty.");
  if (buf.length > maxBytes) throw new HttpError(413, "file_too_large", `Files must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`);
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const byExt = EXT[ext];
  if (!byExt) throw new HttpError(415, "unsupported_type", "Supported formats: PDF, DOCX, Markdown and plain text.");

  if (byExt === "application/pdf") {
    if (!startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) throw new HttpError(415, "type_mismatch", "This file doesn't look like a valid PDF.");
    return byExt;
  }
  if (byExt.includes("wordprocessingml")) {
    // DOCX is a ZIP archive containing word/document.xml.
    if (!startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || !buf.includes(Buffer.from("word/"))) {
      throw new HttpError(415, "type_mismatch", "This file doesn't look like a valid Word (.docx) document.");
    }
    return byExt;
  }
  // Text formats: must be valid UTF-8 without NUL bytes.
  if (buf.includes(0)) throw new HttpError(415, "type_mismatch", "Text files must not contain binary data.");
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    throw new HttpError(415, "type_mismatch", "Text files must be UTF-8 encoded.");
  }
  return byExt;
}

/** Strip path components and control characters from a user-supplied file name. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_").slice(0, 160) || "file";
}

export function titleFromFileName(name: string): string {
  return safeFileName(name)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "Untitled document";
}
