import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDocx, buildPdf } from "../../drizzle/seed-files";
import { chunkPages, splitLong } from "@/server/ingest/chunk";
import { extractText, htmlToText } from "@/server/ingest/extract";
import { fetchPublicPage, isPublicAddress, robotsAllows, validateUrl } from "@/server/ingest/url";
import { detectFileType, safeFileName, titleFromFileName } from "@/server/ingest/validate";

const MB = 1024 * 1024;
const SAMPLE = "Policy\nSEED DATA note\n\nFirst heading\nAlpha beta gamma delta epsilon zeta eta theta.\n\nSecond heading\nThe per diem is $60 per day for domestic trips.";

describe("upload validation (magic bytes, not extensions)", () => {
  it("accepts real PDF and DOCX files", async () => {
    expect(detectFileType("a.pdf", await buildPdf(SAMPLE), 10 * MB)).toBe("application/pdf");
    expect(detectFileType("a.docx", await buildDocx(SAMPLE), 10 * MB)).toContain("wordprocessingml");
    expect(detectFileType("notes.md", Buffer.from("# Hi\nthere"), 10 * MB)).toBe("text/markdown");
  });
  it("rejects renamed binaries, wrong types, empty and oversized files", () => {
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]);
    expect(() => detectFileType("invoice.pdf", exe, MB)).toThrow(/valid PDF/);
    expect(() => detectFileType("doc.docx", Buffer.from("PK\x03\x04 not word"), MB)).toThrow(/Word/);
    expect(() => detectFileType("notes.txt", Buffer.from([0x68, 0x00, 0x69]), MB)).toThrow(/binary/);
    expect(() => detectFileType("notes.txt", Buffer.from([0xff, 0xfe, 0xfd]), MB)).toThrow(/UTF-8/);
    expect(() => detectFileType("run.exe", exe, MB)).toThrow(/Supported formats/);
    expect(() => detectFileType("a.txt", Buffer.alloc(0), MB)).toThrow(/empty/);
    expect(() => detectFileType("a.txt", Buffer.alloc(2 * MB, 97), MB)).toThrow(/1 MB or smaller/);
  });
  it("sanitizes file names", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\x\\bad<name>.pdf")).toBe("bad_name_.pdf");
    expect(titleFromFileName("travel_expense-policy.v2.pdf")).toBe("travel expense policy.v2");
  });
});

describe("text extraction (real parsers)", () => {
  it("extracts PDF text page by page", async () => {
    const out = await extractText(await buildPdf(SAMPLE), "application/pdf");
    expect(out.pageCount).toBe(2);
    expect(out.pages[1]!.page).toBe(2);
    expect(out.pages[1]!.text).toContain("$60 per day");
  });
  it("extracts DOCX text", async () => {
    const out = await extractText(await buildDocx(SAMPLE), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(out.pages[0]!.text).toContain("Second heading");
    expect(out.pages[0]!.page).toBeNull();
  });
  it("turns HTML into readable text without scripts or navigation", async () => {
    const out = await htmlToText("<html><head><title>Returns</title><script>alert(1)</script></head><body><nav>Menu</nav><main><h2>Policy</h2><p>Return within 30 days.</p></main><footer>©</footer></body></html>");
    expect(out.title).toBe("Returns");
    expect(out.pages[0]!.text).toContain("## Policy");
    expect(out.pages[0]!.text).toContain("Return within 30 days.");
    expect(out.pages[0]!.text).not.toMatch(/alert|Menu/);
  });
});

describe("chunking", () => {
  it("prefixes headings, keeps pages and never crosses page boundaries", () => {
    const chunks = chunkPages([
      { page: 1, text: "# Vacation\n\nYou get 25 days per year of paid vacation time." },
      { page: 2, text: "# Sick leave\n\nTen paid sick days per year are available to everyone." },
    ]);
    expect(chunks).toEqual([
      { content: "Vacation — You get 25 days per year of paid vacation time.", page: 1, heading: "Vacation" },
      { content: "Sick leave — Ten paid sick days per year are available to everyone.", page: 2, heading: "Sick leave" },
    ]);
  });
  it("respects the size limit and overlaps consecutive chunks", () => {
    const para = (i: number) => `Paragraph ${i} explains an important rule in detail. It has a second sentence too.`;
    const text = Array.from({ length: 20 }, (_, i) => para(i)).join("\n\n");
    const chunks = chunkPages([{ page: null, text }], { maxChars: 300, overlapChars: 80 });
    expect(chunks.length).toBeGreaterThan(4);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(300 + 80 + 4);
    const tailOfFirst = chunks[0]!.content.slice(-40);
    expect(chunks[1]!.content).toContain(tailOfFirst.slice(-20));
  });
  it("splits very long paragraphs on sentence boundaries", () => {
    const long = "One sentence here. ".repeat(100);
    const parts = splitLong(long, 200);
    expect(parts.every((p) => p.length <= 200)).toBe(true);
    expect(parts[0]!.endsWith(".")).toBe(true);
  });
  it("drops fragments that are too short to be useful", () => {
    expect(chunkPages([{ page: 1, text: "ok" }])).toEqual([]);
  });
});

describe("URL safety (SSRF and robots.txt)", () => {
  it("only treats public unicast addresses as reachable", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::1", "fc00::1", "::ffff:127.0.0.1", "0.0.0.0"]) expect(isPublicAddress(ip), ip).toBe(false);
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isPublicAddress(ip), ip).toBe(true);
  });
  it("rejects non-http schemes, credentials and unusual ports", () => {
    expect(() => validateUrl("file:///etc/passwd")).toThrow(/http/);
    expect(() => validateUrl("https://user:pw@example.com")).toThrow(/credentials/);
    expect(() => validateUrl("http://example.com:6379/")).toThrow(/ports/);
    expect(() => validateUrl("not a url")).toThrow(/valid URL/);
    expect(validateUrl("https://example.com/a?b=1").hostname).toBe("example.com");
  });
  it("parses robots.txt rules for the * agent", () => {
    const robots = "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private\nAllow: /private/public\n";
    expect(robotsAllows(robots, "/docs")).toBe(true);
    expect(robotsAllows(robots, "/private/x")).toBe(false);
    expect(robotsAllows(robots, "/private/public/y")).toBe(true);
  });

  describe("fetchPublicPage against a local server", () => {
    let server: http.Server;
    let base = "";
    beforeAll(async () => {
      server = http.createServer((req, res) => {
        if (req.url === "/robots.txt") return res.writeHead(200, { "content-type": "text/plain" }).end("User-agent: *\nDisallow: /secret");
        if (req.url === "/page") return res.writeHead(200, { "content-type": "text/html" }).end("<title>T</title><p>Hello</p>");
        if (req.url === "/secret") return res.writeHead(200, { "content-type": "text/html" }).end("nope");
        if (req.url === "/big") return res.writeHead(200, { "content-type": "text/plain" }).end("x".repeat(3 * MB));
        if (req.url === "/bin") return res.writeHead(200, { "content-type": "application/octet-stream" }).end("x");
        if (req.url === "/loop") return res.writeHead(302, { location: "/loop" }).end();
        res.writeHead(404).end();
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      base = `http://localhost:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => server.close());

    it("blocks private/loopback addresses by default (SSRF protection), even on an allowed port", async () => {
      await expect(fetchPublicPage(`${base}/page`, { allowAnyPort: true })).rejects.toMatchObject({ code: "blocked_address" });
      await expect(fetchPublicPage("http://127.0.0.1/")).rejects.toMatchObject({ code: "blocked_address" });
    });
    it("fetches a page and reports its type (private allowed only in this test)", async () => {
      const page = await fetchPublicPage(`${base}/page`, { allowPrivate: true, allowAnyPort: true });
      expect(page.mimeType).toBe("text/html");
      expect(page.body.toString()).toContain("Hello");
    });
    it("respects robots.txt, size, content type and redirect limits", async () => {
      const opts = { allowPrivate: true, allowAnyPort: true };
      await expect(fetchPublicPage(`${base}/secret`, opts)).rejects.toMatchObject({ code: "robots_disallowed" });
      await expect(fetchPublicPage(`${base}/big`, opts)).rejects.toMatchObject({ code: "page_too_large" });
      await expect(fetchPublicPage(`${base}/bin`, opts)).rejects.toMatchObject({ code: "unsupported_type" });
      await expect(fetchPublicPage(`${base}/loop`, opts)).rejects.toMatchObject({ code: "too_many_redirects" });
      await expect(fetchPublicPage(`${base}/missing`, opts)).rejects.toMatchObject({ code: "fetch_failed" });
    });
  });
});

describe("SSRF regression: IP-literal hosts", () => {
  it.each(["http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/", "http://10.1.2.3/", "http://0.0.0.0/"])("blocks %s", async (u) => {
    await expect(fetchPublicPage(u)).rejects.toMatchObject({ code: "blocked_address" });
  });
});
