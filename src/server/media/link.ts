import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { IncomingHttpHeaders } from "node:http";
import { inspectMp4 } from "./mp4";
import { inspectWebmDuration } from "./webm";

/** Server-verified metadata for a remotely hosted creative. */
export interface LinkProbe {
  url: string;
  kind: "FILE" | "HLS";
  mimeType: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  codec: string | null;
  sizeBytes: number | null;
  cors: boolean;
  warnings: string[];
}

export type LinkResult = { ok: true; probe: LinkProbe } | { ok: false; errors: string[] };

export const VIDEO_CONTENT_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "application/mp4"]);
export const HLS_CONTENT_TYPES = new Set(["application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/mpegurl", "audio/x-mpegurl", "application/mpegurl"]);

const PLAYER_PAGES = [
  { host: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/, name: "YouTube" },
  { host: /(^|\.)vimeo\.com$/, name: "Vimeo" },
  { host: /(^|\.)twitch\.tv$/, name: "Twitch" },
  { host: /(^|\.)tiktok\.com$/, name: "TikTok" },
  { host: /(^|\.)instagram\.com$/, name: "Instagram" },
  { host: /(^|\.)x\.com$|(^|\.)twitter\.com$/, name: "X" },
];

/** RFC1918, loopback, link-local, CGNAT, multicast and reserved ranges. */
export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    return a === "::1" || a === "::" || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe80") || a.startsWith("::ffff:");
  }
  const p = address.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
  if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true;
  return p[0] >= 224;
}

export function normalizeMediaUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "That is not a valid URL" };
  }
  if (url.protocol !== "https:") return { ok: false, error: "The link has to be https" };
  if (url.username || url.password) return { ok: false, error: "Remove the credentials from the URL" };
  if (url.port && url.port !== "443") return { ok: false, error: "Only the standard https port is accepted" };
  const page = PLAYER_PAGES.find((entry) => entry.host.test(url.hostname));
  if (page) return { ok: false, error: `${page.name} pages cannot be played here. Link the video file (.mp4, .webm) or an HLS stream (.m3u8) instead.` };
  url.hash = "";
  return { ok: true, url };
}

async function publicAddresses(hostname: string): Promise<Array<{ address: string; family: 4 | 6 }>> {
  const rows = await lookup(hostname, { all: true, verbatim: true });
  if (!rows.length) throw new Error(`Could not resolve ${hostname}`);
  if (rows.some((row) => isPrivateAddress(row.address))) throw new Error("That address is on a private network");
  return rows.map((row) => ({ address: row.address, family: row.family as 4 | 6 }));
}

interface SafeResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  finalUrl: URL;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** Validate and pin DNS for every request and every redirect before connecting. */
async function safeRequest(
  raw: string | URL,
  opts: { method?: "GET" | "HEAD"; headers?: Record<string, string>; maxBytes?: number; signal: AbortSignal },
  redirects = 0,
): Promise<SafeResponse> {
  if (redirects > 4) throw new Error("The link redirects too many times");
  const normalized = normalizeMediaUrl(raw.toString());
  if (!normalized.ok) throw new Error(normalized.error);
  const url = normalized.url;
  const addresses = await publicAddresses(url.hostname);
  const pinned = addresses[0];
  const maxBytes = opts.maxBytes ?? 0;

  return new Promise<SafeResponse>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      opts.signal.removeEventListener("abort", abort);
      fn();
    };
    const req = httpsRequest(
      {
        protocol: "https:",
        hostname: url.hostname,
        port: 443,
        method: opts.method ?? "GET",
        path: `${url.pathname}${url.search}`,
        headers: { host: url.host, "user-agent": "AIRTIME-Media-Probe/1.0", ...opts.headers },
        servername: isIP(url.hostname) ? undefined : url.hostname,
        // Hand back the address we already vetted, in whichever shape the socket
        // asked for it. Node enables autoSelectFamily by default from 20 on, and
        // that path calls the hook with `all: true` and expects an array; giving
        // it a bare string there fails every connection with "Invalid IP address".
        lookup: (_hostname, options, callback) => {
          if (options && (options as { all?: boolean }).all) {
            (callback as unknown as (err: null, addresses: Array<{ address: string; family: number }>) => void)(null, [{ address: pinned.address, family: pinned.family }]);
            return;
          }
          callback(null, pinned.address, pinned.family);
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        if (REDIRECTS.has(status) && location) {
          res.resume();
          const destination = new URL(location, url);
          safeRequest(destination, opts, redirects + 1).then(
            (value) => finish(() => resolve(value)),
            (error) => finish(() => reject(error)),
          );
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (maxBytes === 0 || total > maxBytes) {
            req.destroy(new Error(maxBytes === 0 ? "Unexpected response body" : "The remote response is too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => finish(() => resolve({ status, headers: res.headers, body: Buffer.concat(chunks, total), finalUrl: url })));
        res.on("error", (error) => finish(() => reject(error)));
      },
    );
    const abort = () => req.destroy(Object.assign(new Error("The link took too long to respond"), { name: "AbortError" }));
    opts.signal.addEventListener("abort", abort, { once: true });
    req.setTimeout(15_000, abort);
    req.on("error", (error) => finish(() => reject(error)));
    req.end();
  });
}

function header(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function fetchRange(url: string, start: number, end: number, signal: AbortSignal): Promise<Buffer | null> {
  const response = await safeRequest(url, { headers: { range: `bytes=${start}-${end}` }, maxBytes: end - start + 2, signal });
  if (response.status < 200 || response.status >= 300) return null;
  return response.body.length ? response.body : null;
}

export function fixedHlsDuration(text: string): number | null {
  if (!text.includes("#EXTM3U") || !text.includes("#EXT-X-ENDLIST")) return null;
  const durations = [...text.matchAll(/#EXTINF:\s*([0-9.]+)/g)].map((match) => Number(match[1])).filter((value) => Number.isFinite(value) && value >= 0);
  return durations.length ? durations.reduce((sum, value) => sum + value, 0) : null;
}

async function hlsDuration(url: string, signal: AbortSignal, depth = 0): Promise<number | null> {
  const response = await safeRequest(url, { maxBytes: 2_000_000, signal });
  if (response.status < 200 || response.status >= 300) return null;
  const text = response.body.toString("utf8");
  const duration = fixedHlsDuration(text);
  if (duration !== null) return duration;
  if (depth === 0 && text.includes("#EXT-X-STREAM-INF")) {
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
      const target = lines[i + 1]?.trim();
      if (!target || target.startsWith("#")) continue;
      return hlsDuration(new URL(target, response.finalUrl).toString(), signal, depth + 1);
    }
  }
  return null;
}

export async function probeMediaLink(raw: string, opts: { maxDurationSec: number; label: string }): Promise<LinkResult> {
  const normalized = normalizeMediaUrl(raw);
  if (!normalized.ok) return { ok: false, errors: [normalized.error] };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const warnings: string[] = [];
  try {
    let head = await safeRequest(normalized.url, { method: "HEAD", signal: controller.signal });
    if (head.status === 405 || head.status === 501) {
      head = await safeRequest(normalized.url, { headers: { range: "bytes=0-0" }, maxBytes: 2, signal: controller.signal });
    }
    if (head.status < 200 || head.status >= 300) return { ok: false, errors: [`The link returned HTTP ${head.status}`] };

    const mimeType = header(head.headers, "content-type").split(";")[0].trim().toLowerCase();
    const contentRange = header(head.headers, "content-range");
    const totalFromRange = /\/(\d+)$/.exec(contentRange)?.[1];
    const lengthHeader = totalFromRange ?? header(head.headers, "content-length");
    const parsedLength = lengthHeader ? Number(lengthHeader) : Number.NaN;
    const sizeBytes = Number.isSafeInteger(parsedLength) && parsedLength >= 0 ? parsedLength : null;
    const cors = Boolean(header(head.headers, "access-control-allow-origin"));
    if (!cors) warnings.push("This origin does not send CORS headers, so the picture cannot be drawn onto the screen in the 3D room. It will still play in the flat player.");

    const finalUrl = head.finalUrl.toString();
    const pathname = head.finalUrl.pathname.toLowerCase();
    const looksHls = HLS_CONTENT_TYPES.has(mimeType) || pathname.endsWith(".m3u8");
    const looksFile = VIDEO_CONTENT_TYPES.has(mimeType) || /\.(mp4|m4v|webm|mov)$/.test(pathname);
    if (!looksHls && !looksFile) return { ok: false, errors: [mimeType ? `That link serves ${mimeType}, which is not video.` : "That link does not serve a video file."] };

    if (looksHls) {
      const durationSec = await hlsDuration(finalUrl, controller.signal);
      if (durationSec === null) return { ok: false, errors: ["That playlist has no fixed, verifiable length. Live or incomplete streams cannot be submitted."] };
      if (durationSec > opts.maxDurationSec + 1) return { ok: false, errors: [`That stream runs ${Math.round(durationSec)}s. ${opts.label} accepts up to ${opts.maxDurationSec}s.`] };
      return { ok: true, probe: { url: finalUrl, kind: "HLS", mimeType: mimeType || "application/vnd.apple.mpegurl", durationSec, width: null, height: null, hasAudio: true, codec: null, sizeBytes, cors, warnings } };
    }

    if (mimeType === "video/webm" || pathname.endsWith(".webm")) {
      const bytes = await fetchRange(finalUrl, 0, 2_000_000, controller.signal);
      const durationSec = bytes ? inspectWebmDuration(bytes) : null;
      if (durationSec === null) return { ok: false, errors: ["That WebM running time could not be verified. Export it with standard Segment Info metadata or use MP4/HLS."] };
      if (durationSec > opts.maxDurationSec + 0.5) return { ok: false, errors: [`That video runs ${durationSec.toFixed(1)}s. ${opts.label} accepts up to ${opts.maxDurationSec}s.`] };
      if (durationSec <= 0.5) return { ok: false, errors: ["That video is too short to air"] };
      return { ok: true, probe: { url: finalUrl, kind: "FILE", mimeType: "video/webm", durationSec, width: null, height: null, hasAudio: true, codec: null, sizeBytes, cors, warnings } };
    }

    let info: ReturnType<typeof inspectMp4> = null;
    const first = await fetchRange(finalUrl, 0, 2_000_000, controller.signal);
    if (first) info = inspectMp4(first);
    if (!info && sizeBytes && sizeBytes > 2_000_000) {
      const tail = await fetchRange(finalUrl, Math.max(0, sizeBytes - 3_000_000), sizeBytes - 1, controller.signal);
      if (tail) info = inspectMp4(tail);
    }
    if (!info) return { ok: false, errors: ["That MP4 could not be read. Re-export it as a web-optimized or faststart MP4 and try again."] };
    if (info.durationSec > opts.maxDurationSec + 0.5) return { ok: false, errors: [`That video runs ${info.durationSec.toFixed(1)}s. ${opts.label} accepts up to ${opts.maxDurationSec}s.`] };
    if (info.durationSec <= 0.5) return { ok: false, errors: ["That video is too short to air"] };
    return { ok: true, probe: { url: finalUrl, kind: "FILE", mimeType: "video/mp4", durationSec: info.durationSec, width: info.width || null, height: info.height || null, hasAudio: info.hasAudio, codec: info.videoCodec, sizeBytes, cors, warnings } };
  } catch (error) {
    const message = (error as Error).name === "AbortError" ? "That link took too long to respond" : `That link could not be reached: ${(error as Error).message}`;
    return { ok: false, errors: [message] };
  } finally {
    clearTimeout(timer);
  }
}
