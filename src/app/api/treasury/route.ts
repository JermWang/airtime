import { route } from "@/server/route";
import { json } from "@/server/http";
import { getTreasurySummary, getTreasuryLedger } from "@/server/treasury/treasury";

export const dynamic = "force-dynamic";

/** Public treasury: what the network earned, what it bought, what went out. */
export const GET = route(async () => {
  const [summary, ledger] = await Promise.all([getTreasurySummary(), getTreasuryLedger(50)]);
  return json({ summary, ledger });
});
