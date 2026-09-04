import { timingSafeEqual } from "node:crypto";
import { route } from "@/server/route";
import { json, HttpError } from "@/server/http";
import { tickOnce } from "@/server/worker/ticker";
import { env, isProduction } from "@/server/env";
import { isServerless, platformName } from "@/server/platform";
import { serverNowMs } from "@/server/time/clock";

export const dynamic = "force-dynamic";
/** One tick is quick, but it may scan the chain for payments. */
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = env().AIRTIME_CRON_SECRET;
  // Vercel signs its own cron invocations with the project's CRON_SECRET.
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : new URL(req.url).searchParams.get("secret") ?? "";
  if (!secret) {
    // Without a configured secret this is only callable off a public deployment,
    // so local development and self-hosted setups keep working out of the box.
    return !isProduction();
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Drives the station where no long-lived process exists.
 *
 * A serverless deployment has no resident scheduler: `setInterval` dies with the
 * invocation that created it. Vercel Cron calls this every minute, and read
 * endpoints tick opportunistically in between, so quotes expire and campaigns go
 * on and off air on time.
 *
 * The work is exactly the same `tickOnce()` the in-process scheduler runs, and it
 * is idempotent — overlapping calls are harmless.
 */
async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) throw new HttpError(401, "Unauthorized");
  const started = Date.now();
  await tickOnce();
  return json({
    ok: true,
    platform: platformName(),
    serverless: isServerless(),
    serverTime: serverNowMs(),
    tookMs: Date.now() - started,
  });
}

export const GET = route(handle);
export const POST = route(handle);
