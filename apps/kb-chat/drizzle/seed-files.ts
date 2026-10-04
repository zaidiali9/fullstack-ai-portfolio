/**
 * Build real PDF and DOCX files from the seed text so the seed exercises the same parsers
 * (unpdf, mammoth) as user uploads. Input format: line 1 = title, line 2 = seed note, then
 * alternating "Heading" / "paragraph" lines separated by blank lines.
 */
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface Section {
  heading: string;
  body: string;
}

export function parseSeedText(text: string): { title: string; note: string; sections: Section[] } {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const [head, ...rest] = blocks;
  const [title = "Untitled", note = ""] = head!.split("\n");
  return {
    title,
    note,
    sections: rest.map((b) => {
      const [heading, ...body] = b.split("\n");
      return { heading: heading!.trim(), body: body.join(" ").trim() };
    }),
  };
}

function wrap(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** One section per page, so citations can point at real page numbers. */
export async function buildPdf(text: string): Promise<Buffer> {
  const { title, note, sections } = parseSeedText(text);
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  sections.forEach((s, i) => {
    const page = pdf.addPage([612, 792]);
    let y = 730;
    if (i === 0) {
      page.drawText(title, { x: 60, y, size: 20, font: bold, color: rgb(0.15, 0.15, 0.3) });
      y -= 22;
      for (const l of wrap(note, font, 9, 490)) {
        page.drawText(l, { x: 60, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
        y -= 12;
      }
      y -= 16;
    }
    page.drawText(s.heading, { x: 60, y, size: 14, font: bold });
    y -= 22;
    for (const l of wrap(s.body, font, 11, 490)) {
      page.drawText(l, { x: 60, y, size: 11, font });
      y -= 16;
    }
    page.drawText(`Page ${i + 1} of ${sections.length}`, { x: 60, y: 40, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  });
  return Buffer.from(await pdf.save());
}

export async function buildDocx(text: string): Promise<Buffer> {
  const { title, note, sections } = parseSeedText(text);
  const doc = new Document({
    creator: "Cairn seed script",
    title,
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }),
          new Paragraph({ children: [new TextRun({ text: note, italics: true })] }),
          ...sections.flatMap((s) => [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(s.heading)] }), new Paragraph({ children: [new TextRun(s.body)] })]),
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
