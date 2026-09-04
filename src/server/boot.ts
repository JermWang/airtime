import { ensureMigrated } from "./db/client";
import { ensureBaseline, seedDevData } from "./db/seed";
import { loadClockOffset } from "./settings";
import { ensureScheduleHorizon } from "./broadcast/schedule";
import { startTicker } from "./worker/ticker";
import { env, isProduction } from "./env";
import { quoteSignerAddress } from "./chain/quoteSigner";
import { paymentContractAddress } from "./chain/client";

declare global {
  // eslint-disable-next-line no-var
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
      await ensureMigrated();
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
          `  chain        ${e.NEXT_PUBLIC_CHAIN_ENV}`,
          `  contract     ${contract ?? "NOT CONFIGURED – purchases disabled"}`,
          `  quote signer ${quoteSignerAddress()}`,
          `  database     ${e.DATABASE_URL ? "postgres" : "pglite (embedded)"}`,
          seeded ? "  seeded       DEV DATA programming" : "",
          adminPassword && !isProduction() ? `  admin        ${e.ADMIN_EMAIL} / ${adminPassword}` : "",
          "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      if ((opts.ticker ?? true) && !e.AIRTIME_DISABLE_TICKER) startTicker(1000);
    })().catch((err) => {
      globalThis.__airtimeBooted = undefined;
      throw err;
    });
  }
  return globalThis.__airtimeBooted;
}
