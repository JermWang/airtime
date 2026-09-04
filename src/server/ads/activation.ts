import { and, eq, lte, gt, inArray, sql } from "drizzle-orm";
import { db, schema, type Tx } from "../db/client";
import { serverNow } from "../time/clock";
import { publish } from "../realtime/bus";
import { audit, SYSTEM } from "../audit";
import type { AirLogAnalytics, Campaign } from "../db/schema";

/**
 * Activation engine: moves paid campaigns on and off air at their reserved
 * times and writes the AirLog receipt when they complete.
 */

export async function activateDueCampaigns(now = serverNow()): Promise<number> {
  const due = await db()
    .select()
    .from(schema.campaigns)
    .where(and(eq(schema.campaigns.status, "QUEUED"), lte(schema.campaigns.startsAt, now), gt(schema.campaigns.endsAt, now)));
  for (const c of due) {
    await db().transaction(async (tx) => {
      await tx.update(schema.campaigns).set({ status: "AIRING", updatedAt: now }).where(eq(schema.campaigns.id, c.id));
      await tx
        .update(schema.adActivations)
        .set({ status: "ACTIVE", startedAt: now })
        .where(and(eq(schema.adActivations.campaignId, c.id), eq(schema.adActivations.status, "SCHEDULED")));
      await audit(SYSTEM, "campaign.airing", { type: "campaign", id: c.id }, { placementId: c.placementId }, tx);
    });
    publish({ type: "placement.activated", placementId: c.placementId, campaignId: c.id, channelId: c.channelId });
    publish({ type: "campaign.updated", campaignId: c.id, status: "AIRING", placementId: c.placementId });
    publish({ type: "queue.updated", channelId: c.channelId });
  }
  return due.length;
}

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

async function writeAirLog(tx: Tx, c: Campaign, opts: { actualStart: Date | null; actualEnd: Date | null; playbackStatus: string }): Promise<string> {
  const [payment] = await tx.select().from(schema.payments).where(eq(schema.payments.campaignId, c.id));
  const analytics = await aggregateAnalytics(tx, c.id);
  const [log] = await tx
    .insert(schema.airLogs)
    .values({
      campaignId: c.id,
      creativeId: c.creativeId,
      placementId: c.placementId,
      channelId: c.channelId,
      scheduledStart: c.startsAt!,
      scheduledEnd: c.endsAt!,
      actualStart: opts.actualStart,
      actualEnd: opts.actualEnd,
      txHash: payment?.txHash ?? null,
      blockNumber: payment?.blockNumber ?? null,
      chainId: payment?.chainId ?? null,
      walletAddress: c.walletAddress,
      amountWei: payment?.amountWei ?? null,
      paymentToken: payment?.paymentToken ?? null,
      playbackStatus: opts.playbackStatus,
      analytics,
    })
    .onConflictDoNothing({ target: schema.airLogs.campaignId })
    .returning();
  return log?.id ?? "";
}

export async function completeDueCampaigns(now = serverNow()): Promise<number> {
  const due = await db()
    .select()
    .from(schema.campaigns)
    .where(and(eq(schema.campaigns.status, "AIRING"), lte(schema.campaigns.endsAt, now)));
  for (const c of due) {
    await db().transaction(async (tx) => {
      const [activation] = await tx.select().from(schema.adActivations).where(and(eq(schema.adActivations.campaignId, c.id), eq(schema.adActivations.status, "ACTIVE")));
      await tx.update(schema.adActivations).set({ status: "ENDED", endedAt: now }).where(and(eq(schema.adActivations.campaignId, c.id), eq(schema.adActivations.status, "ACTIVE")));
      const analytics = await aggregateAnalytics(tx, c.id);
      const playbackStatus = analytics.creativeLoadFailure > 0 && analytics.creativeLoadSuccess === 0 ? "FAILED" : analytics.creativeLoadSuccess > 0 ? "DELIVERED" : "UNOBSERVED";
      await writeAirLog(tx, c, { actualStart: activation?.startedAt ?? c.startsAt, actualEnd: now, playbackStatus });
      await tx.update(schema.campaigns).set({ status: "COMPLETED", updatedAt: now }).where(eq(schema.campaigns.id, c.id));
      await audit(SYSTEM, "campaign.completed", { type: "campaign", id: c.id }, { playbackStatus }, tx);
    });
    publish({ type: "placement.released", placementId: c.placementId, campaignId: c.id, channelId: c.channelId });
    publish({ type: "campaign.updated", campaignId: c.id, status: "COMPLETED", placementId: c.placementId });
    publish({ type: "queue.updated", channelId: c.channelId });
  }
  return due.length;
}

/** Campaigns whose window passed entirely while nothing was running (server outage). Recorded honestly. */
export async function reconcileMissedCampaigns(now = serverNow()): Promise<number> {
  const missed = await db()
    .select()
    .from(schema.campaigns)
    .where(and(inArray(schema.campaigns.status, ["QUEUED", "PAID"]), lte(schema.campaigns.endsAt, now)));
  for (const c of missed) {
    await db().transaction(async (tx) => {
      await tx.update(schema.adActivations).set({ status: "FAILED", failureReason: "Scheduler was not running during the reserved window" }).where(and(eq(schema.adActivations.campaignId, c.id), inArray(schema.adActivations.status, ["SCHEDULED", "ACTIVE"])));
      await writeAirLog(tx, c, { actualStart: null, actualEnd: null, playbackStatus: "MISSED" });
      await tx.update(schema.campaigns).set({ status: "COMPLETED", rejectionReason: "Missed: scheduler offline during window", updatedAt: now }).where(eq(schema.campaigns.id, c.id));
      await audit(SYSTEM, "campaign.missed", { type: "campaign", id: c.id }, {}, tx);
    });
    publish({ type: "campaign.updated", campaignId: c.id, status: "COMPLETED", placementId: c.placementId });
    publish({ type: "queue.updated", channelId: c.channelId });
  }
  return missed.length;
}
