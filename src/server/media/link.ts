import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { inspectMp4 } from "./mp4";

/**
 * Submissions that live somewhere else.
 *
 * A show is up to thirty minutes; nobody wants to push that through an upload
 * form, so a submitter can hand us a URL instead. The station then has to answer
 * three questions before it will sell airtime against it, and it answers them
 * itself rather than trusting the browser:
 *
 *   1. Is it safe to fetch?      No private addresses, https only, no redirects
 *                                into somewhere we would not have gone directly.
 *   2. Is it actually video?     Content type and, for MP4, the real container.
 *   3. How long is it?           A show may not exceed 30 minutes, an ad 30
 *                                seconds, and we measure that rather than ask.
 *
 * The picture and its audio then come straight off that origin into the same
 * <video> element the station always uses, so a linked show is played by the
 * station exactly like an uploaded one. That needs the origin to send CORS
 * headers, because the frame is copied into a WebGL texture — so we check.
 *
 * What we deliberately do not do is embed somebody else's player. No iframes,
 * no third-party scripts: a page link (a YouTube or Vimeo watch page) is
 * rejected with an explanation rather than wrapped in an embed.
 */

export const VIDEO_CONTENT_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "application/mp4"]);
export const HLS_CONTENT_TYPES = new Set(["application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/mpegurl", "audio/x-mpegurl", "application/mpegurl"]);

/** Sites whose watch pages people paste most, so the error can be specific. */
const PLAYER_PAGES = [
  { host: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/, name: "YouTube" },
  { host: /(^|\.)vimeo\.com$/, name: "Vimeo" },
  { host: /(^|\.)twitch\.tv$/, name: "Twitch" },
  { host: /(^|\.)tiktok\.com$/, name: "TikTok" },
  { host: /(^|\.)instagram\.com$/, name: "Instagram" },
  { host: /(^|\.)x\.com$|(^|\.)twitter\.com$/, name: "X" },
];

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
  /** True when the origin sends an Access-Control-Allow-Origin header. */
  cors: boolean;
  warnings: string[];
}

export type LinkResult = { ok: true; probe: LinkProbe } | { ok: false; errors: string[] };

/** RFC1918, loopback, link-local, CGNAT, unique-local: never fetch these. */
function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    return a === "::1" || a === "::" || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe80") || a.startsWith("::ffff:");
  }
  const p = address.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
  if (p[0] >= 224) return true;
  return false;
}

async function assertPublicHost(host: string): Promise<string | null> {
  try {
    const results = await lookup(host, { all: true });
    if (!results.length) return `Could not resolve ${host}`;
    for (const r of results) if (isPrivateAddress(r.address)) return "That address is on a private network";
    return null;
  } catch {
    return `Could not resolve ${host}`;
  }
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
  const page = PLAYER_PAGES.find((p) => p.host.test(url.hostname));
  if (page) {
    return {
      ok: false,
      error: `${page.name} pages cannot be played here: the station plays the video itself rather than embedding somebody else's player. Link the video file (.mp4, .webm) or an HLS stream (.m3u8) instead.`,
    };
  }
  url.hash = "";
  return { ok: true, url };
}

async function fetchRange(url: string, start: number, end: number, signal: AbortSignal): Promise<Buffer | null> {
  const res = await fetch(url, { headers: { range: `bytes=${start}-${end}` }, redirect: "follow", signal });
  if (!res.ok && res.status !== 206) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length ? buf : null;
}

/** Total duration of a VOD HLS playlist, following one level of master playlist. */
async function hlsDuration(url: string, signal: AbortSignal, depth = 0): Promise<number | null> {
  const res = await fetch(url, { redirect: "follow", signal });
  if (!res.ok) return null;
  const text = (await res.text()).slice(0, 2_000_000);
  if (!text.includes("#EXTM3U")) return null;

  const extinf = [...text.matchAll(/#EXTINF:\s*([0-9.]+)/g)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n));
  if (extinf.length) return extinf.reduce((a, b) => a + b, 0);

  // Master playlist: follow the first variant once.
  if (depth === 0 && text.includes("#EXT-X-STREAM-INF")) {
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
      const target = lines[i + 1]?.trim();
      if (!target || target.startsWith("#")) continue;
      const variant = new URL(target, url).toString();
      return hlsDuration(variant, signal, depth + 1);
    }
  }
  // A live stream has no EXTINF total worth summing.
  return null;
}

/**
 * Fetch just enough of the target to know what it is and how long it runs.
 * Never downloads the whole file: an MP4 gives up its `moov` atom in the first
 * or last couple of megabytes, and an HLS playlist is text.
 */
export async function probeMediaLink(raw: string, opts: { maxDurationSec: number; label: string }): Promise<LinkResult> {
  const normalized = normalizeMediaUrl(raw);
  if (!normalized.ok) return { ok: false, errors: [normalized.error] };
  const url = normalized.url;

  const privateHost = await assertPublicHost(url.hostname);
  if (privateHost) return { ok: false, errors: [privateHost] };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const warnings: string[] = [];
  try {
    let head = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (!head.ok && head.status !== 405 && head.status !== 501) {
      // Some CDNs refuse HEAD; a one-byte range tells us the same things.
      head = await fetch(url, { headers: { range: "bytes=0-0" }, redirect: "follow", signal: controller.signal });
    }
    if (!head.ok && head.status !== 206) return { ok: false, errors: [`The link returned HTTP ${head.status}`] };

    // A redirect can land somewhere we would have refused to go directly.
    if (head.url && head.url !== url.toString()) {
      const dest = normalizeMediaUrl(head.url);
      if (!dest.ok) return { ok: false, errors: [`The link redirects somewhere that cannot be played: ${dest.error}`] };
      const destPrivate = await assertPublicHost(dest.url.hostname);
      if (destPrivate) return { ok: false, errors: [destPrivate] };
    }

    const mimeType = (head.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const lengthHeader = head.headers.get("content-length");
    const sizeBytes = lengthHeader ? Number(lengthHeader) : null;
    const cors = Boolean(head.headers.get("access-control-allow-origin"));
    if (!cors) {
      warnings.push("This origin does not send CORS headers, so the picture cannot be drawn onto the screen in the 3D room. It will still play in the flat player.");
    }

    const path = url.pathname.toLowerCase();
    const looksHls = HLS_CONTENT_TYPES.has(mimeType) || path.endsWith(".m3u8");
    const looksFile = VIDEO_CONTENT_TYPES.has(mimeType) || /\.(mp4|m4v|webm|mov)$/.test(path);

    if (!looksHls && !looksFile) {
      return {
        ok: false,
        errors: [
          mimeType
            ? `That link serves ${mimeType}, which is not video. Link a video file (.mp4, .webm) or an HLS stream (.m3u8).`
            : "That link does not serve a video file. Link a video file (.mp4, .webm) or an HLS stream (.m3u8).",
        ],
      };
    }

    if (looksHls) {
      const durationSec = await hlsDuration(url.toString(), controller.signal);
      if (durationSec === null) {
        return { ok: false, errors: ["That playlist has no fixed length. A live stream cannot be submitted; link a recorded show."] };
      }
      if (durationSec > opts.maxDurationSec + 1) {
        return { ok: false, errors: [`That stream runs ${Math.round(durationSec)}s. ${opts.label} accepts up to ${opts.maxDurationSec}s.`] };
      }
      return {
        ok: true,
        probe: { url: url.toString(), kind: "HLS", mimeType: mimeType || "application/vnd.apple.mpegurl", durationSec, width: null, height: null, hasAudio: true, codec: null, sizeBytes, cors, warnings },
      };
    }

    // A progressive file: read the container for real numbers.
    const isMp4 = mimeType === "video/webm" ? false : true;
    if (mimeType === "video/webm" || path.endsWith(".webm")) {
      warnings.push("WebM containers are not parsed here, so the station cannot confirm the running time before it airs.");
      return { ok: true, probe: { url: url.toString(), kind: "FILE", mimeType: "video/webm", durationSec: null, width: null, height: null, hasAudio: true, codec: null, sizeBytes, cors, warnings } };
    }

    let info = null as ReturnType<typeof inspectMp4>;
    const head1 = await fetchRange(url.toString(), 0, 2_000_000, controller.signal);
    if (head1) info = inspectMp4(head1);
    if (!info && sizeBytes && sizeBytes > 2_000_000) {
      // Not a faststart file: the moov atom is at the end.
      const tail = await fetchRange(url.toString(), Math.max(0, sizeBytes - 3_000_000), sizeBytes - 1, controller.signal);
      if (tail) info = inspectMp4(tail);
    }
    if (!info) {
      return { ok: false, errors: ["That MP4 could not be read. Re-export it with the metadata at the front (a 'faststart' or 'web optimised' export) and try again."] };
    }
    if (info.durationSec > opts.maxDurationSec + 0.5) {
      return { ok: false, errors: [`That video runs ${info.durationSec.toFixed(1)}s. ${opts.label} accepts up to ${opts.maxDurationSec}s.`] };
    }
    if (info.durationSec <= 0.5) return { ok: false, errors: ["That video is too short to air"] };

    return {
      ok: true,
      probe: {
        url: url.toString(),
        kind: "FILE",
        mimeType: isMp4 ? "video/mp4" : mimeType,
        durationSec: info.durationSec,
        width: info.width || null,
        height: info.height || null,
        hasAudio: info.hasAudio,
        codec: info.videoCodec ?? null,
        sizeBytes,
        cors,
        warnings,
      },
    };
  } catch (err) {
    const message = (err as Error).name === "AbortError" ? "That link took too long to respond" : `That link could not be reached: ${(err as Error).message}`;
    return { ok: false, errors: [message] };
  } finally {
    clearTimeout(timer);
  }
}
