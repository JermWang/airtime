import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema, type Tx } from "../db/client";
import { serverNow, addSeconds } from "../time/clock";
import { publish } from "../realtime/bus";
import { audit, SYSTEM, type Actor } from "../audit";
import type { AirLogAnalytics, Campaign, Placement } from "../db/schema";

/**
 * Run lifecycle.
 *
 * A run starts the moment a payment is verified and ends when somebody outbids
 * it, when the buyer withdraws, or when an operator pulls it. Nothing here is
 * scheduled ahead of time: there is no queue, and a campaign's `endsAt` is
 * unknown until the run is actually over.
 */

export type EndReason = "OUTBID" | "WITHDRAWN" | "CAP_REACHED" | "REMOVED";

const END_NOTE: Record<EndReason, string> = {
  OUTBID: "Outbid: another buyer paid more for the surface",
  WITHDRAWN: "Withdrawn by the buyer",
  CAP_REACHED: "Maximum run length reached",
  REMOVED: "Taken off air by the station",
};

async function aggregateAnalytics(tx: Tx, campaignId: string): Promise<AirLogAnalytics> {
  const rows = await tx
    .select({ type: schema.analyticsEvents.type, count: sql<number>`count(*)`, sessions: sql<number>`count(distinct ${schema.analyticsEvents.sessionHash})` })
    .from(schema.analyticsEvents)
    .where(eq(schema.analyticsEvents.campaignId, campaignId))
    .groupBy(schema.analyticsEvents.type);
  const by = (t: string) => rows.find((r) => r.type === t);
  const [sessions] = await tx
    .select({ n: sql<number>`count(distinct ${schema.analyticsEvents.sessionHash})` })
    .from(schema.analyticsEvents)
    .where(eq(schema.analyticsEvents.campaignId, campaignId));
  return {
    sessionsPresent: Number(by("present")?.count ?? 0),
    uniqueSessionsApprox: Number(sessions?.n ?? 0),
    creativeLoadSuccess: Number(by("load_ok")?.count ?? 0),
    creativeLoadFailure: Number(by("load_fail")?.count ?? 0),
    visibilitySamples: Number(by("visible")?.count ?? 0) + Number(by("hidden")?.count ?? 0),
    visibleSamples: Number(by("visible")?.count ?? 0),
    videoCompletions: Number(by("video_complete")?.count ?? 0),
    clicks: Number(by("click")?.count ?? 0),
  };
}

async function writeAirLog(tx: Tx, c: Campaign, opts: { actualStart: Date | null; actualEnd: Date | null; playbackStatus: string }): Promise<void> {
  const [payment] = await tx.select().from(schema.payments).where(eq(schema.payments.campaignId, c.id));
  const analytics = await aggregateAnalytics(tx, c.id);
  await tx
    .insert(schema.airLogs)
    .values({
      campaignId: c.id,
      creativeId: c.creativeId,
      placementId: c.placementId,
      channelId: c.channelId,
      scheduledStart: c.startsAt ?? opts.actualStart ?? serverNow(),
      scheduledEnd: c.guaranteedUntil ?? opts.actualEnd ?? serverNow(),
      actualStart: opts.actualStart,
      actualEnd: opts.actualEnd,
      txHash: payment?.txHash ?? null,
      blockNumber: payment?.blockNumber ?? null,
      chainId: payment?.chainId ?? null,
      walletAddress: c.walletAddress,
      amountWei: payment?.amountWei ?? c.paidPriceWei ?? null,
      paymentToken: payment?.paymentToken ?? null,
      playbackStatus: opts.playbackStatus,
      analytics,
    })
    .onConflictDoNothing({ target: schema.airLogs.campaignId });
}

/**
 * End a live run and free the surface.
 *
 * The descending clock restarts from the price the departing occupant paid, so
 * a surface that nobody wants gets cheaper from wherever the market left it.
 */
export async function endRun(tx: Tx, campaign: Campaign, opts: { reason: EndReason; now: Date; actor?: Actor }): Promise<void> {
  const now = opts.now;
  const [activation] = await tx
    .select()
    .from(schema.adActivations)
    .where(and(eq(schema.adActivations.campaignId, campaign.id), eq(schema.adActivations.status, "ACTIVE")));
  await tx
    .update(schema.adActivations)
    .set({ status: "ENDED", endedAt: now })
    .where(and(eq(schema.adActivations.campaignId, campaign.id), inArray(schema.adActivations.status, ["SCHEDULED", "ACTIVE"])));

  const analytics = await aggregateAnalytics(tx, campaign.id);
  const playbackStatus = analytics.creativeLoadFailure > 0 && analytics.creativeLoadSuccess === 0 ? "FAILED" : analytics.creativeLoadSuccess > 0 ? "DELIVERED" : "UNOBSERVED";
  const actualStart = activation?.startedAt ?? campaign.startsAt ?? null;
  await writeAirLog(tx, campaign, { actualStart, actualEnd: now, playbackStatus });

  const runtimeSec = actualStart ? Math.max(0, Math.round((now.getTime() - actualStart.getTime()) / 1000)) : 0;
  await tx
    .update(schema.campaigns)
    .set({ status: "COMPLETED", endsAt: now, durationSec: runtimeSec, endedReason: opts.reason, updatedAt: now })
    .where(eq(schema.campaigns.id, campaign.id));
  await tx
    .update(schema.reservations)
    .set({ status: "RELEASED", endsAt: now })
    .where(and(eq(schema.reservations.campaignId, campaign.id), eq(schema.reservations.status, "CONFIRMED")));

  // Free the surface and restart the descent from the price it last cleared at.
  await tx
    .update(schema.placements)
    .set({ currentCampaignId: null, askResetAt: now, updatedAt: now })
    .where(eq(schema.placements.id, campaign.placementId));

  await audit(opts.actor ?? SYSTEM, "campaign.run_ended", { type: "campaign", id: campaign.id }, { reason: opts.reason, runtimeSec, note: END_NOTE[opts.reason] }, tx);
  publish({ type: "placement.released", placementId: campaign.placementId, campaignId: campaign.id, channelId: campaign.channelId });
  publish({ type: "campaign.updated", campaignId: campaign.id, status: "COMPLETED", placementId: campaign.placementId });
  publish({ type: "queue.updated", channelId: campaign.channelId });
}

export interface TakeSurfaceInput {
  placement: Placement;
  campaign: Campaign;
  amountWei: bigint;
  guaranteedUntil: Date;
  now: Date;
}

/**
 * Put a paid campaign on a surface, displacing whoever is on it.
 *
 * The caller must already hold a row lock on the placement. The incumbent is
 * only displaced when the new payment is strictly larger than theirs; the
 * decision is made here, on the server, from the amount the chain reported.
 */
export async function takeSurface(tx: Tx, input: TakeSurfaceInput): Promise<{ ok: true; displaced: Campaign | null } | { ok: false; reason: string }> {
  const { placement, campaign, amountWei, now } = input;

  const [incumbent] = await tx
    .select()
    .from(schema.campaigns)
    .where(and(eq(schema.campaigns.placementId, placement.id), eq(schema.campaigns.status, "AIRING")));

  if (incumbent && incumbent.id !== campaign.id) {
    const held = BigInt(incumbent.paidPriceWei ?? "0");
    if (amountWei <= held) {
      return { ok: false, reason: `The surface was taken at a higher price (${held} wei) before this payment confirmed` };
    }
    await endRun(tx, incumbent, { reason: "OUTBID", now });
  }

  await tx
    .update(schema.campaigns)
    .set({ status: "AIRING", startsAt: now, endsAt: null, guaranteedUntil: input.guaranteedUntil, paidPriceWei: amountWei.toString(), endedReason: null, durationSec: null, updatedAt: now })
    .where(eq(schema.campaigns.id, campaign.id));

  await tx
    .insert(schema.adActivations)
    .values({
      campaignId: campaign.id,
      placementId: campaign.placementId,
      channelId: campaign.channelId,
      scheduledStart: now,
      scheduledEnd: input.guaranteedUntil,
      status: "ACTIVE",
      startedAt: now,
    });

  // A sale resets the clock: the ask jumps to the takeover premium and starts
  // walking back down from there.
  await tx
    .update(schema.placements)
    .set({ currentCampaignId: campaign.id, lastClearingPriceWei: amountWei.toString(), askResetAt: now, updatedAt: now })
    .where(eq(schema.placements.id, placement.id));

  await audit(SYSTEM, "campaign.on_air", { type: "campaign", id: campaign.id }, { placementId: placement.id, amountWei: amountWei.toString(), displaced: incumbent?.id ?? null }, tx);
  publish({ type: "placement.activated", placementId: campaign.placementId, campaignId: campaign.id, channelId: campaign.channelId });
  publish({ type: "campaign.updated", campaignId: campaign.id, status: "AIRING", placementId: campaign.placementId });
  publish({ type: "queue.updated", channelId: campaign.channelId });
  return { ok: true, displaced: incumbent && incumbent.id !== campaign.id ? incumbent : null };
}

/**
 * Safety net: a payment that was verified but whose run never started (a crash
 * between recording the payment and taking the surface). Runs every tick.
 */
export async function activatePaidCampaigns(now = serverNow()): Promise<number> {
  const stranded = await db().select().from(schema.campaigns).where(eq(schema.campaigns.status, "PAID"));
  let started = 0;
  for (const c of stranded) {
    await db().transaction(async (tx) => {
      const [placement] = await tx.select().from(schema.placements).where(eq(schema.placements.id, c.placementId)).for("update");
      const [fresh] = await tx.select().from(schema.campaigns).where(eq(schema.campaigns.id, c.id));
      if (!placement || !fresh || fresh.status !== "PAID") return;
      const amount = BigInt(fresh.paidPriceWei ?? "0");
      if (amount <= 0n) return;
      const guaranteedUntil = fresh.guaranteedUntil ?? addSeconds(now, placement.auction.minHoldSeconds);
      const result = await takeSurface(tx, { placement, campaign: fresh, amountWei: amount, guaranteedUntil, now });
      if (!result.ok) {
        await tx.update(schema.campaigns).set({ status: "REJECTED", rejectionReason: result.reason, updatedAt: now }).where(eq(schema.campaigns.id, fresh.id));
        await audit(SYSTEM, "campaign.lost_race", { type: "campaign", id: fresh.id }, { reason: result.reason }, tx);
        publish({ type: "campaign.updated", campaignId: fresh.id, status: "REJECTED", placementId: fresh.placementId });
        return;
      }
      started++;
    });
  }
  return started;
}

/**
 * Runs that hit the operator's hard cap. Surfaces with `maxHoldSeconds = 0` run
 * until somebody outbids them, which is the default.
 */
export async function releaseCappedRuns(now = serverNow()): Promise<number> {
  const rows = await db()
    .select({ campaign: schema.campaigns, placement: schema.placements })
    .from(schema.campaigns)
    .innerJoin(schema.placements, eq(schema.campaigns.placementId, schema.placements.id))
    .where(eq(schema.campaigns.status, "AIRING"));
  let ended = 0;
  for (const { campaign, placement } of rows) {
    const cap = placement.auction.maxHoldSeconds;
    if (!cap || cap <= 0 || !campaign.startsAt) continue;
    if (now.getTime() - campaign.startsAt.getTime() < cap * 1000) continue;
    await db().transaction(async (tx) => {
      const [fresh] = await tx.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaign.id));
      if (!fresh || fresh.status !== "AIRING") return;
      await endRun(tx, fresh, { reason: "CAP_REACHED", now });
      ended++;
    });
  }
  return ended;
}

/** Buyer voluntarily gives the surface back. Nothing is refunded: the runtime was delivered. */
export async function withdrawRun(campaignId: string, actor: Actor, reason: EndReason = "WITHDRAWN"): Promise<void> {
  const now = serverNow();
  await db().transaction(async (tx) => {
    const [campaign] = await tx.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
    if (!campaign || campaign.status !== "AIRING") return;
    await tx.select().from(schema.placements).where(eq(schema.placements.id, campaign.placementId)).for("update");
    await endRun(tx, campaign, { reason, now, actor });
  });
}
