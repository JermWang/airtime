import { env, isProduction } from "./env";

/**
 * Where is this process running?
 *
 * Vercel (and any serverless host) gives each request a short-lived, read-only
 * container: `setInterval` does not survive between invocations and the only
 * writable path is /tmp, which is not shared. Three things in AIRTIME assume a
 * long-lived server with a disk, so they need a different answer there:
 *
 *   the scheduler   → driven by cron hitting /api/cron/tick, plus an
 *                     opportunistic tick on read traffic
 *   the database    → managed Postgres via DATABASE_URL (never embedded PGlite)
 *   creative storage→ an object store via STORAGE_PROVIDER=s3
 */
export const isVercel = () => Boolean(process.env.VERCEL);

/** True on any host where the filesystem is read-only and processes are per-request. */
export function isServerless(): boolean {
  if (process.env.AIRTIME_FORCE_SERVERLESS === "true") return true;
  if (process.env.AIRTIME_FORCE_SERVERLESS === "false") return false;
  return isVercel() || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) || Boolean(process.env.FUNCTION_TARGET);
}

/** A long-lived in-process scheduler is only viable off serverless. */
export function canRunInProcessTicker(): boolean {
  return !isServerless() && !env().AIRTIME_DISABLE_TICKER;
}

export function platformName(): string {
  if (isVercel()) return `vercel (${process.env.VERCEL_ENV ?? "unknown"})`;
  if (isServerless()) return "serverless";
  return isProduction() ? "server" : "development";
}

/**
 * Guidance shown once at boot when the configuration cannot work on this host,
 * so a failed deploy explains itself instead of erroring deep in a request.
 */
export function configurationProblems(): string[] {
  const e = env();
  const problems: string[] = [];
  if (isServerless()) {
    if (!e.DATABASE_URL) {
      problems.push("DATABASE_URL is empty. The embedded PGlite database writes to disk and cannot run on a serverless host — set DATABASE_URL to a managed Postgres instance.");
    }
    if (e.STORAGE_PROVIDER === "local") {
      problems.push("STORAGE_PROVIDER=local writes uploaded creatives to disk, which is read-only here — set STORAGE_PROVIDER=s3 with a bucket and STORAGE_PUBLIC_BASE_URL.");
    }
    if (!e.AIRTIME_CRON_SECRET && isProduction()) {
      problems.push("AIRTIME_CRON_SECRET is unset. The scheduler runs from cron on this host; without the secret /api/cron/tick will reject every call.");
    }
  }
  return problems;
}
