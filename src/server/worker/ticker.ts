import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { serverNow } from "../time/clock";
import { blockAt, ensureScheduleHorizon } from "../broadcast/schedule";
import { expireQuotes } from "../ads/quotes";
import { activateDueCampaigns, completeDueCampaigns, reconcileMissedCampaigns } from "../ads/activation";
import { pollAwaitingPayments } from "../chain/paymentVerifier";
import { publish } from "../realtime/bus";

/**
 * The station scheduler. One instance per process; in development it runs
 * inside the Next.js server (instrumentation.ts), in production it can run
 * there or as the dedicated `pnpm worker` process.
 *
 * Every tick (1s):
 *   - expire quotes / release held inventory
 *   - activate & complete campaigns whose reserved window starts/ends
 *   - detect program boundaries and broadcast NOW/NEXT changes
 * Every 4s: scan the chain for payments of open quotes.
 * Every 60s: extend the programming horizon.
 */

declare global {
  // eslint-disable-next-line no-var
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
    await safe("reconcileMissed", () => reconcileMissedCampaigns(now));
    await safe("activate", () => activateDueCampaigns(now));
    await safe("complete", () => completeDueCampaigns(now));

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
