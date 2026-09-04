import { eq } from "drizzle-orm";
import { db, schema } from "./db/client";
import { publish } from "./realtime/bus";
import { setClockOffsetMs } from "./time/clock";

/**
 * Runtime settings stored in the `settings` table. Small, typed, cached for a
 * couple of seconds so hot paths (quote creation) do not hit the database twice.
 */
export interface StationSettings {
  purchasesPaused: boolean;
  clockOffsetMs: number;
  /** Seconds a quote holds inventory. */
  quoteHoldSeconds: number;
  /** Default channel shown on the homepage. */
  defaultChannelId: string;
  /** Share of network income earmarked for Anduril pre-stock, in basis points. */
  treasuryAllocationBps: number;
  /**
   * The most any single token holder is rewarded with, as a share of the Anduril
   * pre-IPO allocation, in parts per million. 50 ppm = 0.005%. Basis points are
   * too coarse for a number this small, and it must stay an integer: it is a
   * share of an asset, never a float.
   */
  holderRewardCapPpm: number;
}

export const DEFAULT_SETTINGS: StationSettings = {
  purchasesPaused: false,
  clockOffsetMs: 0,
  quoteHoldSeconds: 180,
  defaultChannelId: "MAIN",
  treasuryAllocationBps: 10_000,
  holderRewardCapPpm: 50,
};

let cache: { value: StationSettings; at: number } | null = null;

export async function getSettings(): Promise<StationSettings> {
  if (cache && Date.now() - cache.at < 2000) return cache.value;
  const rows = await db().select().from(schema.settings);
  const value: StationSettings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in value) {
      (value as unknown as Record<string, unknown>)[row.key] = row.value;
    }
  }
  cache = { value, at: Date.now() };
  return value;
}

export async function setSetting<K extends keyof StationSettings>(key: K, value: StationSettings[K]): Promise<void> {
  await db()
    .insert(schema.settings)
    .values({ key, value: value as unknown, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: value as unknown, updatedAt: new Date() } });
  cache = null;
  if (key === "clockOffsetMs") {
    setClockOffsetMs(value as number);
    publish({ type: "clock.updated", offsetMs: value as number });
  }
  publish({ type: "settings.updated", key });
}

/** Called at boot so the in-process clock reflects the persisted dev offset. */
export async function loadClockOffset(): Promise<void> {
  const [row] = await db().select().from(schema.settings).where(eq(schema.settings.key, "clockOffsetMs"));
  if (row && typeof row.value === "number") setClockOffsetMs(row.value);
}
