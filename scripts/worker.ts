import "./_env";
import { boot } from "../src/server/boot";

/**
 * Dedicated scheduler process for production deployments where the web tier is
 * horizontally scaled. Set AIRTIME_DISABLE_TICKER=true on the web instances and
 * run exactly one worker. Requires DATABASE_URL (Postgres) – the embedded
 * PGlite database is single-process.
 */
if (!process.env.DATABASE_URL) {
  console.error("The worker requires DATABASE_URL (Postgres). In development the scheduler runs inside `next dev`.");
  process.exit(1);
}
process.env.AIRTIME_DISABLE_TICKER = "false";
boot({ ticker: true })
  .then(() => console.log("AIRTIME worker running"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
