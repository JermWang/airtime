import { ensureMigrated } from "./db/client";
import { ensureBaseline, seedDevData } from "./db/seed";
import { loadClockOffset } from "./settings";
import { ensureScheduleHorizon } from "./broadcast/schedule";
import { startTicker } from "./worker/ticker";
import { env, isProduction } from "./env";
import { quoteSignerAddress } from "./chain/quoteSigner";
import { paymentContractAddress } from "./chain/client";
import { canRunInProcessTicker, configurationProblems, isServerless, platformName } from "./platform";

declare global {
  var __airtimeBooted: Promise<void> | undefined;
}

/**
 * Process boot: migrate, ensure baseline rows, seed dev data, load the sim
 * clock, extend the programming horizon and start the scheduler. Idempotent
 * and shared across HMR reloads through globalThis.
 */
export function boot(opts: { ticker?: boolean } = {}): Promise<void> {
  if (!globalThis.__airtimeBooted) {
    globalThis.__airtimeBooted = (async () => {
      if (env().AIRTIME_MIGRATE_ON_BOOT) await ensureMigrated();
      const { adminPassword } = await ensureBaseline();
      const seeded = await seedDevData();
      await loadClockOffset();
      await ensureScheduleHorizon("MAIN", 12);
      const e = env();
      const contract = paymentContractAddress();
      console.log(
        [
          "",
          "  AIRTIME station boot",
          `  platform     ${platformName()}`,
          `  chain        ${e.NEXT_PUBLIC_CHAIN_ENV}`,
          `  contract     ${contract ?? "NOT CONFIGURED – purchases disabled"}`,
          `  quote signer ${quoteSignerAddress()}`,
          `  database     ${e.DATABASE_URL ? "postgres" : "pglite (embedded)"}`,
          `  scheduler    ${canRunInProcessTicker() ? "in-process (1s)" : isServerless() ? "cron + opportunistic (/api/cron/tick)" : "disabled"}`,
          seeded ? "  seeded       DEV DATA programming" : "",
          adminPassword && !isProduction() ? `  admin        ${e.ADMIN_EMAIL} / ${adminPassword}` : "",
          "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      for (const problem of configurationProblems()) console.warn(`  [config] ${problem}`);
      // A serverless host gets no resident scheduler: cron and request traffic drive it.
      if ((opts.ticker ?? true) && canRunInProcessTicker()) startTicker(1000);
    })().catch((err) => {
      globalThis.__airtimeBooted = undefined;
      throw err;
    });
  }
  return globalThis.__airtimeBooted;
}
