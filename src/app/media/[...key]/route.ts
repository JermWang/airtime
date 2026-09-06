import { boot } from "@/server/boot";
import { storage, assertSafeKey } from "@/server/media/storage";

export const dynamic = "force-dynamic";

export interface ByteRange {
  start: number;
  end: number;
}

/** Parse one RFC 7233 byte range. Multiple ranges are intentionally unsupported. */
export function parseByteRange(value: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || size <= 0 || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || requestedEnd < start || start >= size) return null;
  return { start, end: Math.min(requestedEnd, size - 1) };
}

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
};

/**
 * Serves creatives from controlled local storage. Content types are fixed by
 * extension (uploads were re-encoded/validated), the response is sandboxed
 * and never sniffed. Supports byte ranges for <video>.
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }): Promise<Response> {
  await boot();
  const { key: parts } = await params;
  const key = parts.join("/");
  try {
    assertSafeKey(key);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPES[ext];
  if (!type) return new Response("Not found", { status: 404 });
  const store = storage();
  if (store.kind !== "local") return Response.redirect(store.publicUrl(key), 302);

  const headers: Record<string, string> = {
    "content-type": type,
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'",
    "content-disposition": "inline",
    "accept-ranges": "bytes",
    "cross-origin-resource-policy": "same-origin",
  };

  const range = req.headers.get("range");
  if (range) {
    const size = await store.size(key);
    if (size === null) return new Response("Not found", { status: 404 });
    const parsed = parseByteRange(range, size);
    if (!parsed) return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
    const chunk = await store.getRange(key, parsed.start, parsed.end);
    if (!chunk) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${parsed.start}-${parsed.end}/${size}`, "content-length": String(chunk.length) },
    });
  }
  const bytes = await store.get(key);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), { status: 200, headers: { ...headers, "content-length": String(bytes.length) } });
}
