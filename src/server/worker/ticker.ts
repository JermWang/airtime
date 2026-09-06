import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { serverNow } from "../time/clock";
import { blockAt, ensureScheduleHorizon } from "../broadcast/schedule";
import { expireQuotes } from "../ads/quotes";
import { activatePaidCampaigns, releaseCappedRuns } from "../ads/activation";
import { pollAwaitingPayments } from "../chain/paymentVerifier";
import { publish } from "../realtime/bus";

/**
 * The station scheduler. One instance per process; in development it runs
 * inside the Next.js server (instrumentation.ts), in production it can run
 * there or as the dedicated `pnpm worker` process.
 *
 * Every tick (1s):
 *   - expire quote holds so a surface can be bought again
 *   - start any paid run that has not taken its surface yet, and end runs that
 *     hit an operator hard cap
 *   - detect program boundaries and broadcast NOW/NEXT changes
 * Every 4s: scan the chain for payments of open quotes.
 * Every 60s: extend the programming horizon.
 */

declare global {
  var __airtimeTicker: { timer: NodeJS.Timeout; stop: () => void } | undefined;
}

const currentBlockByChannel = new Map<string, string | null>();
let lastPaymentPoll = 0;
let lastHorizon = 0;
let running = false;

export async function tickOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const now = serverNow();
    await safe("expireQuotes", () => expireQuotes(now));
    await safe("activate", () => activatePaidCampaigns(now));
    await safe("releaseCapped", () => releaseCappedRuns(now));

    if (Date.now() - lastPaymentPoll > 4000) {
      lastPaymentPoll = Date.now();
      await safe("payments", () => pollAwaitingPayments());
    }

    const channels = await db().select().from(schema.channels).where(eq(schema.channels.isActive, true));
    if (Date.now() - lastHorizon > 60_000) {
      lastHorizon = Date.now();
      for (const ch of channels) await safe(`horizon:${ch.id}`, () => ensureScheduleHorizon(ch.id));
    }
    for (const ch of channels) {
      const block = await blockAt(ch.id, now);
      const id = block?.id ?? null;
      if (currentBlockByChannel.has(ch.id) && currentBlockByChannel.get(ch.id) !== id) {
        publish({ type: "program.changed", channelId: ch.id, blockId: id });
      }
      currentBlockByChannel.set(ch.id, id);
    }
  } finally {
    running = false;
  }
}

async function safe(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[ticker:${label}]`, err);
  }
}

/**
 * Run a tick from request traffic, at most once every `minGapMs`.
 *
 * On a serverless host there is no resident scheduler between cron firings, so
 * read endpoints nudge the station forward. It is cheap, idempotent and never
 * blocks the response: worst case a campaign activates on the next request
 * instead of waiting for the next cron minute.
 */
let lastOpportunistic = 0;

export function tickOpportunistically(minGapMs = 4000): void {
  const now = Date.now();
  if (now - lastOpportunistic < minGapMs) return;
  lastOpportunistic = now;
  void tickOnce().catch((err) => console.error("[ticker:opportunistic]", err));
}

export function startTicker(intervalMs = 1000): void {
  if (globalThis.__airtimeTicker) return;
  const timer = setInterval(() => void tickOnce(), intervalMs);
  timer.unref?.();
  globalThis.__airtimeTicker = {
    timer,
    stop: () => {
      clearInterval(timer);
      globalThis.__airtimeTicker = undefined;
    },
  };
  void tickOnce();
}

export function stopTicker(): void {
  globalThis.__airtimeTicker?.stop();
}
