import { boot } from "@/server/boot";
import { storage, assertSafeKey } from "@/server/media/storage";

export const dynamic = "force-dynamic";

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
  if (storage().kind !== "local") return Response.redirect(storage().publicUrl(key), 302);

  const bytes = await storage().get(key);
  if (!bytes) return new Response("Not found", { status: 404 });

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
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(parseInt(m[2], 10), bytes.length - 1) : bytes.length - 1;
      if (start <= end && start < bytes.length) {
        const chunk = bytes.subarray(start, end + 1);
        return new Response(new Uint8Array(chunk), {
          status: 206,
          headers: { ...headers, "content-range": `bytes ${start}-${end}/${bytes.length}`, "content-length": String(chunk.length) },
        });
      }
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${bytes.length}` } });
    }
  }
  return new Response(new Uint8Array(bytes), { status: 200, headers: { ...headers, "content-length": String(bytes.length) } });
}
