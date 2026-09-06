import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AuthError } from "./auth/session";

/** JSON response with bigint-safe serialization. */
export function json(data: unknown, init?: ResponseInit): NextResponse {
  const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new NextResponse(body, { ...init, headers });
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function badRequest(message: string, details?: unknown): never {
  throw new HttpError(400, message, details);
}
export function notFound(message = "Not found"): never {
  throw new HttpError(404, message);
}
export function conflict(message: string, details?: unknown): never {
  throw new HttpError(409, message, details);
}

/** Wrap a route handler with uniform error handling. */
export function handler<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<Response>): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, details: err.details ?? null }, { status: err.status });
      if (err instanceof AuthError) return json({ error: err.message }, { status: err.status });
      if (err instanceof ZodError) return json({ error: "Invalid request", details: err.issues }, { status: 400 });
      console.error("[api]", err);
      return json({ error: "Internal error" }, { status: 500 });
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (obj[k] = v));
  return schema.parse(obj);
}

/** Parse multipart data through a byte-counting stream, independent of Content-Length honesty. */
export async function parseFormDataLimited(req: Request, maxBytes: number): Promise<FormData> {
  const declared = req.headers.get("content-length");
  if (declared) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0) throw new HttpError(400, "Invalid Content-Length");
    if (length > maxBytes) throw new HttpError(413, "Upload too large");
  }
  if (!req.body) throw new HttpError(400, "Expected multipart form data");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "Upload too large");
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)), received);
    return await new Response(body, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Expected multipart form data");
  } finally {
    reader.releaseLock();
  }
}

/* ------------------------------------------------------------------------- */
/*  Rate limiting (token bucket per key, in-process)                          */
/* ------------------------------------------------------------------------- */

declare global {
  var __airtimeRate: Map<string, { tokens: number; at: number }> | undefined;
}

export function rateLimit(req: Request, bucket: string, opts: { limit: number; windowSec: number }): void {
  const store = (globalThis.__airtimeRate ??= new Map());
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = store.get(key) ?? { tokens: opts.limit, at: now };
  const refill = ((now - entry.at) / 1000) * (opts.limit / opts.windowSec);
  entry.tokens = Math.min(opts.limit, entry.tokens + refill);
  entry.at = now;
  if (entry.tokens < 1) {
    store.set(key, entry);
    throw new HttpError(429, "Too many requests");
  }
  entry.tokens -= 1;
  store.set(key, entry);
  if (store.size > 50_000) store.clear();
}

/** Same-origin check for state-changing requests (CSRF defense in depth alongside SameSite cookies). */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser client; cookies are not sent cross-site anyway
  const host = req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "Cross-origin request rejected");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "Invalid origin");
  }
}
