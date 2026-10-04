import dns from "node:dns";
import ipaddr from "ipaddr.js";
import { Agent, fetch as undiciFetch } from "undici";
import { HttpError } from "@portfolio/kit";

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = "CairnBot/1.0 (+document ingestion for a user's private workspace)";

/** Only public unicast addresses are allowed (blocks localhost, private ranges, link-local, metadata IPs). */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let ip = ipaddr.parse(address);
  if (ip.kind() === "ipv6" && (ip as ipaddr.IPv6).isIPv4MappedAddress()) ip = (ip as ipaddr.IPv6).toIPv4Address();
  return ip.range() === "unicast";
}

export function validateUrl(raw: string, opts: { allowAnyPort?: boolean } = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "invalid_url", "Enter a valid URL starting with https:// or http://.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new HttpError(400, "invalid_url", "Only http and https URLs are supported.");
  if (url.username || url.password) throw new HttpError(400, "invalid_url", "URLs with credentials are not allowed.");
  if (!opts.allowAnyPort && url.port && url.port !== "80" && url.port !== "443") throw new HttpError(400, "invalid_url", "Only standard ports (80, 443) are allowed.");
  return url;
}

/**
 * Undici agent whose DNS lookup rejects non-public addresses at CONNECT time, so a hostname that
 * resolves to a private IP (or re-resolves differently, i.e. DNS rebinding) can never be reached.
 */
function safeAgent(allowPrivate: boolean) {
  return new Agent({
    connect: {
      lookup: (hostname, options, cb) => {
        dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
          if (err) return cb(err, "", 4);
          const list = (Array.isArray(addresses) ? addresses : [{ address: addresses as unknown as string, family: 4 }]) as dns.LookupAddress[];
          const ok = allowPrivate ? list : list.filter((a) => isPublicAddress(a.address));
          if (ok.length === 0) return cb(Object.assign(new Error("blocked_address"), { code: "EBLOCKED" }), "", 4);
          if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, ok);
          cb(null, ok[0]!.address, ok[0]!.family);
        });
      },
    },
  });
}

async function readLimited(res: Response, limit: number): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new HttpError(413, "page_too_large", "That page is larger than 2 MB.");
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}

async function safeGet(url: URL, allowPrivate: boolean, accept: string, allowAnyPort = false): Promise<{ res: Response; finalUrl: URL }> {
  const dispatcher = safeAgent(allowPrivate);
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // IP-literal hosts never go through the DNS lookup hook, so check them explicitly (every hop).
    const host = current.hostname.replace(/^\[|\]$/g, "");
    if (!allowPrivate && ipaddr.isValid(host) && !isPublicAddress(host)) {
      throw new HttpError(400, "blocked_address", "That address is not allowed (private or local network).");
    }
    let res: Response;
    try {
      res = (await undiciFetch(current, {
        dispatcher,
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })) as unknown as Response;
    } catch (err) {
      // undici wraps connect errors; look through the whole cause chain for our lookup's code.
      let cause: unknown = err;
      let blocked = false;
      for (let i = 0; cause && i < 5; i++) {
        if ((cause as { code?: string }).code === "EBLOCKED" || /blocked_address/.test(String((cause as Error).message))) blocked = true;
        cause = (cause as { cause?: unknown }).cause;
      }
      if (blocked) throw new HttpError(400, "blocked_address", "That address is not allowed (private or local network).");
      if ((err as Error).name === "TimeoutError") throw new HttpError(504, "fetch_timeout", "The page took too long to respond.");
      throw new HttpError(502, "fetch_failed", "Couldn't reach that URL.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = validateUrl(new URL(res.headers.get("location")!, current).toString(), { allowAnyPort });
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new HttpError(400, "too_many_redirects", "That URL redirects too many times.");
}

/** Minimal robots.txt check for the `*` user agent (longest matching Allow/Disallow wins). */
export function robotsAllows(robotsTxt: string, path: string): boolean {
  let applies = false;
  const rules: { allow: boolean; prefix: string }[] = [];
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const [, key, value] = m;
    if (key!.toLowerCase() === "user-agent") applies = value === "*" || value!.toLowerCase().startsWith("cairnbot");
    else if (applies && (key!.toLowerCase() === "disallow" || key!.toLowerCase() === "allow") && value) {
      rules.push({ allow: key!.toLowerCase() === "allow", prefix: value });
    }
  }
  const match = rules.filter((r) => path.startsWith(r.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match ? match.allow : true;
}

export interface FetchedPage {
  url: string;
  mimeType: "text/html" | "text/plain" | "text/markdown" | "application/pdf";
  body: Buffer;
}

/** Fetch a public web page for ingestion: SSRF-safe, size/time limited, robots.txt respected. */
export async function fetchPublicPage(raw: string, opts: { allowPrivate?: boolean; allowAnyPort?: boolean } = {}): Promise<FetchedPage> {
  const allowAnyPort = opts.allowAnyPort ?? false;
  const url = validateUrl(raw, { allowAnyPort });
  const allowPrivate = opts.allowPrivate ?? false;
  try {
    const { res } = await safeGet(new URL("/robots.txt", url), allowPrivate, "text/plain", allowAnyPort);
    if (res.ok && !robotsAllows((await readLimited(res, 256 * 1024)).toString("utf8"), url.pathname + url.search)) {
      throw new HttpError(403, "robots_disallowed", "This site's robots.txt does not allow automated access to that page.");
    }
  } catch (err) {
    if (err instanceof HttpError && (err.code === "robots_disallowed" || err.code === "blocked_address")) throw err;
    // No reachable robots.txt -> allowed (standard behaviour).
  }
  const { res, finalUrl } = await safeGet(url, allowPrivate, "text/html,text/plain,text/markdown,application/pdf;q=0.8", allowAnyPort);
  if (!res.ok) throw new HttpError(502, "fetch_failed", `The page returned HTTP ${res.status}.`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const mimeType =
    type === "text/html" || type === "application/xhtml+xml" ? "text/html" : type === "text/plain" ? "text/plain" : type === "text/markdown" ? "text/markdown" : type === "application/pdf" ? "application/pdf" : null;
  if (!mimeType) throw new HttpError(415, "unsupported_type", "That URL isn't an HTML page, text or PDF.");
  return { url: finalUrl.toString(), mimeType, body: await readLimited(res, MAX_BYTES) };
}
