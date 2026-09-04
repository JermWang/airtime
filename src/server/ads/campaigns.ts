import { and, asc, desc, eq, inArray, gt } from "drizzle-orm";
import { db, schema } from "../db/client";
import { serverNow, addSeconds } from "../time/clock";
import { HttpError } from "../http";
import { publish } from "../realtime/bus";
import { audit, type Actor } from "../audit";
import { creativeSellable, publicCreative, getOwnedCreative, loadActivePlacement } from "./creatives";
import { describeSurface, type SurfaceState } from "./auction";
import { endRun, withdrawRun } from "./activation";
import { explorerTxUrl } from "@/lib/chain/chains";
import { shortAddress } from "@/lib/format";
import type { Campaign, Placement, Creative, Payment, AirLog } from "../db/schema";

export async function createCampaign(input: { walletAddress: `0x${string}`; placementId: string; displayName: string; creativeId?: string | null; fit?: "FIT" | "FILL"; clickUrl?: string | null }): Promise<Campaign> {
  const placement = await loadActivePlacement(input.placementId);
  let status: Campaign["status"] = "DRAFT";
  let creative: Creative | null = null;
  if (input.creativeId) {
    creative = await getOwnedCreative(input.creativeId, input.walletAddress);
    status = creativeSellable(creative, placement).ok ? "READY_TO_PURCHASE" : "VALIDATING";
  }
  const [row] = await db()
    .insert(schema.campaigns)
    .values({
      walletAddress: input.walletAddress,
      channelId: placement.channelId,
      placementId: placement.id,
      creativeId: creative?.id ?? null,
      displayName: input.displayName.trim().slice(0, 60) || "Untitled campaign",
      status,
      fit: input.fit ?? placement.material.fit,
      clickUrl: placement.allowsClickThrough ? input.clickUrl ?? creative?.clickUrl ?? null : null,
    })
    .returning();
  await audit({ type: "WALLET", id: input.walletAddress }, "campaign.created", { type: "campaign", id: row.id }, { placementId: placement.id });
  return row;
}

export async function getOwnedCampaign(id: string, walletAddress: string): Promise<Campaign> {
  const [row] = await db()
    .select()
    .from(schema.campaigns)
    .where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.walletAddress, walletAddress)));
  if (!row) throw new HttpError(404, "Campaign not found");
  return row;
}

export async function updateCampaignDraft(id: string, walletAddress: `0x${string}`, patch: { creativeId?: string | null; displayName?: string; fit?: "FIT" | "FILL"; clickUrl?: string | null }): Promise<Campaign> {
  const campaign = await getOwnedCampaign(id, walletAddress);
  if (!["DRAFT", "VALIDATING", "READY_TO_PURCHASE"].includes(campaign.status)) throw new HttpError(409, "Campaign can no longer be edited");
  const placement = await loadActivePlacement(campaign.placementId);
  const set: Partial<typeof schema.campaigns.$inferInsert> = { updatedAt: serverNow() };
  if (patch.displayName !== undefined) set.displayName = patch.displayName.trim().slice(0, 60) || campaign.displayName;
  if (patch.fit) set.fit = patch.fit;
  if (patch.clickUrl !== undefined) set.clickUrl = placement.allowsClickThrough ? patch.clickUrl : null;
  if (patch.creativeId !== undefined) {
    if (patch.creativeId) {
      const creative = await getOwnedCreative(patch.creativeId, walletAddress);
      set.creativeId = creative.id;
      set.status = creativeSellable(creative, placement).ok ? "READY_TO_PURCHASE" : "VALIDATING";
    } else {
      set.creativeId = null;
      set.status = "DRAFT";
    }
  }
  const [row] = await db().update(schema.campaigns).set(set).where(eq(schema.campaigns.id, id)).returning();
  publish({ type: "campaign.updated", campaignId: row.id, status: row.status, placementId: row.placementId });
  return row;
}

export async function cancelCampaign(id: string, walletAddress: `0x${string}`): Promise<Campaign> {
  const campaign = await getOwnedCampaign(id, walletAddress);
  if (!["DRAFT", "VALIDATING", "READY_TO_PURCHASE", "AWAITING_PAYMENT"].includes(campaign.status)) throw new HttpError(409, "Paid campaigns cannot be cancelled here");
  return db().transaction(async (tx) => {
    await tx.update(schema.reservations).set({ status: "RELEASED" }).where(and(eq(schema.reservations.campaignId, id), eq(schema.reservations.status, "HELD")));
    await tx.update(schema.quotes).set({ status: "CANCELLED" }).where(and(eq(schema.quotes.campaignId, id), eq(schema.quotes.status, "ACTIVE")));
    const [row] = await tx.update(schema.campaigns).set({ status: "CANCELLED", activeQuoteId: null, updatedAt: serverNow() }).where(eq(schema.campaigns.id, id)).returning();
    await audit({ type: "WALLET", id: walletAddress }, "campaign.cancelled", { type: "campaign", id }, {}, tx);
    publish({ type: "campaign.updated", campaignId: id, status: "CANCELLED", placementId: row.placementId });
    return row;
  });
}

/** The buyer gives the surface back early. The runtime already delivered is not refunded. */
export async function withdrawCampaign(id: string, walletAddress: `0x${string}`): Promise<Campaign> {
  const campaign = await getOwnedCampaign(id, walletAddress);
  if (campaign.status !== "AIRING") throw new HttpError(409, "This campaign is not on a surface");
  await withdrawRun(id, { type: "WALLET", id: walletAddress });
  return getOwnedCampaign(id, walletAddress);
}

/* ------------------------------------------------------------------------- */
/*  Admin transitions                                                         */
/* ------------------------------------------------------------------------- */

export async function adminSetCampaignStatus(id: string, status: "REJECTED" | "REFUNDED" | "CANCELLED", actor: Actor, reason?: string): Promise<Campaign> {
  return db().transaction(async (tx) => {
    const [campaign] = await tx.select().from(schema.campaigns).where(eq(schema.campaigns.id, id));
    if (!campaign) throw new HttpError(404, "Campaign not found");
    if (["COMPLETED"].includes(campaign.status) && status !== "REFUNDED") throw new HttpError(409, "Completed campaigns can only be marked refunded");
    const now = serverNow();
    // A live run is taken off air properly: AirLog written, surface freed, the
    // descending clock restarted from the price it last cleared at.
    if (campaign.status === "AIRING") {
      await tx.select().from(schema.placements).where(eq(schema.placements.id, campaign.placementId)).for("update");
      await endRun(tx, campaign, { reason: "REMOVED", now, actor });
    }
    await tx.update(schema.reservations).set({ status: "RELEASED" }).where(and(eq(schema.reservations.campaignId, id), inArray(schema.reservations.status, ["HELD", "CONFIRMED"])));
    await tx.update(schema.quotes).set({ status: "CANCELLED" }).where(and(eq(schema.quotes.campaignId, id), eq(schema.quotes.status, "ACTIVE")));
    await tx.update(schema.adActivations).set({ status: "FAILED", failureReason: `Campaign ${status.toLowerCase()}` }).where(and(eq(schema.adActivations.campaignId, id), inArray(schema.adActivations.status, ["SCHEDULED", "ACTIVE"])));
    if (status === "REFUNDED") {
      await tx.update(schema.payments).set({ status: "REFUNDED", refundNote: reason ?? null }).where(eq(schema.payments.campaignId, id));
    }
    const [row] = await tx.update(schema.campaigns).set({ status, rejectionReason: reason ?? null, activeQuoteId: null, updatedAt: now }).where(eq(schema.campaigns.id, id)).returning();
    await audit(actor, `campaign.${status.toLowerCase()}`, { type: "campaign", id }, { reason: reason ?? null }, tx);
    publish({ type: "campaign.updated", campaignId: id, status, placementId: campaign.placementId });
    publish({ type: "queue.updated", channelId: campaign.channelId });
    return row;
  });
}

/* ------------------------------------------------------------------------- */
/*  Public projections                                                        */
/* ------------------------------------------------------------------------- */

export interface PublicQueueEntry {
  id: string;
  displayName: string;
  status: Campaign["status"];
  placementId: string;
  placementName: string;
  placementType: Placement["type"];
  placementKind: string;
  ownsMainStream: boolean;
  inventoryMode: Placement["availability"]["inventoryMode"];
  /** When the run took the surface. */
  startsAt: string | null;
  /** When it lost the surface. Null while it is still running. */
  endsAt: string | null;
  /** Runtime it cannot be outbid before. */
  guaranteedUntil: string | null;
  /** What it paid for the surface: the bar a challenger has to clear. */
  pricePaidWei: string | null;
  /** OUTBID | WITHDRAWN | CAP_REACHED | REMOVED */
  endedReason: string | null;
  /** Seconds it has been on the surface (live runs) or ran for (finished ones). */
  runtimeSec: number | null;
  durationSec: number | null;
  wallet: string;
  txHash: string | null;
  txUrl: string | null;
  creative: ReturnType<typeof publicCreative>;
  fit: "FIT" | "FILL";
  clickUrl: string | null;
}

export function toQueueEntry(c: Campaign, placement: Placement, creative: Creative | null, payment: Payment | null, now = serverNow()): PublicQueueEntry {
  const runtimeSec = c.startsAt ? Math.max(0, Math.floor(((c.endsAt ?? now).getTime() - c.startsAt.getTime()) / 1000)) : null;
  return {
    id: c.id,
    displayName: c.displayName,
    status: c.status,
    placementId: placement.id,
    placementName: placement.name,
    placementType: placement.type,
    placementKind: placement.kind,
    ownsMainStream: placement.ownsMainStream,
    inventoryMode: placement.availability.inventoryMode,
    startsAt: c.startsAt?.toISOString() ?? null,
    endsAt: c.endsAt?.toISOString() ?? null,
    guaranteedUntil: c.guaranteedUntil?.toISOString() ?? null,
    pricePaidWei: c.paidPriceWei,
    endedReason: c.endedReason,
    runtimeSec,
    durationSec: c.durationSec,
    wallet: shortAddress(c.walletAddress),
    txHash: payment?.txHash ?? null,
    txUrl: payment ? explorerTxUrl(payment.txHash) : null,
    creative: publicCreative(creative),
    fit: c.fit,
    clickUrl: c.clickUrl,
  };
}

/**
 * The board: what is on air on every surface right now, and what just came off.
 *
 * There is no queue to show. A surface has one occupant, they hold it until
 * somebody pays more, so "up next" is not a thing that exists — the only
 * forward-looking number is the ask, which lives on the surface itself.
 */
export async function getPublicQueue(channelId: string): Promise<{ serverTime: number; onAir: PublicQueueEntry[]; recent: PublicQueueEntry[] }> {
  const now = serverNow();
  const rows = await db()
    .select({ campaign: schema.campaigns, placement: schema.placements, creative: schema.creatives, payment: schema.payments })
    .from(schema.campaigns)
    .innerJoin(schema.placements, eq(schema.campaigns.placementId, schema.placements.id))
    .leftJoin(schema.creatives, eq(schema.campaigns.creativeId, schema.creatives.id))
    .leftJoin(schema.payments, eq(schema.payments.campaignId, schema.campaigns.id))
    .where(and(eq(schema.campaigns.channelId, channelId), inArray(schema.campaigns.status, ["AIRING", "PAID"])))
    .orderBy(asc(schema.placements.sortOrder));

  const recentRows = await db()
    .select({ campaign: schema.campaigns, placement: schema.placements, creative: schema.creatives, payment: schema.payments })
    .from(schema.campaigns)
    .innerJoin(schema.placements, eq(schema.campaigns.placementId, schema.placements.id))
    .leftJoin(schema.creatives, eq(schema.campaigns.creativeId, schema.creatives.id))
    .leftJoin(schema.payments, eq(schema.payments.campaignId, schema.campaigns.id))
    .where(and(eq(schema.campaigns.channelId, channelId), eq(schema.campaigns.status, "COMPLETED"), gt(schema.campaigns.endsAt, addSeconds(now, -24 * 3600))))
    .orderBy(desc(schema.campaigns.endsAt))
    .limit(12);

  return {
    serverTime: now.getTime(),
    onAir: rows.map((r) => toQueueEntry(r.campaign, r.placement, r.creative, r.payment, now)),
    recent: recentRows.map((r) => toQueueEntry(r.campaign, r.placement, r.creative, r.payment, now)),
  };
}

export interface BoardRow {
  placement: Placement;
  surface: SurfaceState;
  occupant: PublicQueueEntry | null;
}

/**
 * Every sellable surface with its live ask and whoever is standing on it. This
 * is the inventory list, the broadcast log and the price board all at once.
 */
export async function getBoard(channelId: string): Promise<{ serverTime: number; rows: BoardRow[] }> {
  const now = serverNow();
  const placements = await db()
    .select()
    .from(schema.placements)
    .where(and(eq(schema.placements.channelId, channelId), eq(schema.placements.isActive, true)))
    .orderBy(asc(schema.placements.sortOrder));

  const live = await db()
    .select({ campaign: schema.campaigns, placement: schema.placements, creative: schema.creatives, payment: schema.payments })
    .from(schema.campaigns)
    .innerJoin(schema.placements, eq(schema.campaigns.placementId, schema.placements.id))
    .leftJoin(schema.creatives, eq(schema.campaigns.creativeId, schema.creatives.id))
    .leftJoin(schema.payments, eq(schema.payments.campaignId, schema.campaigns.id))
    .where(and(eq(schema.campaigns.channelId, channelId), eq(schema.campaigns.status, "AIRING")));

  const holds = await db().select().from(schema.reservations).where(eq(schema.reservations.status, "HELD"));

  const rows: BoardRow[] = placements.map((placement) => {
    const occupancy = live.find((l) => l.campaign.placementId === placement.id) ?? null;
    const hold = holds.find((h) => h.lane === placement.lane && (!h.expiresAt || h.expiresAt > now)) ?? null;
    return {
      placement,
      surface: describeSurface(placement, occupancy?.campaign ?? null, hold, now),
      occupant: occupancy ? toQueueEntry(occupancy.campaign, placement, occupancy.creative, occupancy.payment, now) : null,
    };
  });
  return { serverTime: now.getTime(), rows };
}

/** Everything the station renderer needs: the campaign standing on each surface. */
export async function getActiveActivations(channelId: string): Promise<{ serverTime: number; active: PublicQueueEntry[] }> {
  const now = serverNow();
  const rows = await db()
    .select({ campaign: schema.campaigns, placement: schema.placements, creative: schema.creatives, payment: schema.payments })
    .from(schema.campaigns)
    .innerJoin(schema.placements, eq(schema.campaigns.placementId, schema.placements.id))
    .leftJoin(schema.creatives, eq(schema.campaigns.creativeId, schema.creatives.id))
    .leftJoin(schema.payments, eq(schema.payments.campaignId, schema.campaigns.id))
    .where(and(eq(schema.campaigns.channelId, channelId), eq(schema.campaigns.status, "AIRING")))
    .orderBy(asc(schema.campaigns.startsAt));
  return { serverTime: now.getTime(), active: rows.map((r) => toQueueEntry(r.campaign, r.placement, r.creative, r.payment, now)) };
}

export interface CampaignDetail {
  campaign: Campaign;
  placement: Placement;
  creative: Creative | null;
  payment: Payment | null;
  airLog: AirLog | null;
}

export async function getCampaignDetail(id: string): Promise<CampaignDetail | null> {
  const [row] = await db()
    .select({ campaign: schema.campaigns, placement: schema.placements, creative: schema.creatives, payment: schema.payments, airLog: schema.airLogs })
    .from(schema.campaigns)
    .innerJoin(schema.placements, eq(schema.campaigns.placementId, schema.placements.id))
    .leftJoin(schema.creatives, eq(schema.campaigns.creativeId, schema.creatives.id))
    .leftJoin(schema.payments, eq(schema.payments.campaignId, schema.campaigns.id))
    .leftJoin(schema.airLogs, eq(schema.airLogs.campaignId, schema.campaigns.id))
    .where(eq(schema.campaigns.id, id));
  return row ?? null;
}

/** Projection for the owner (includes active quote) and for public pages (no quote). */
export function campaignView(detail: CampaignDetail, opts: { owner: boolean }) {
  const { campaign, placement, creative, payment, airLog } = detail;
  return {
    id: campaign.id,
    displayName: campaign.displayName,
    status: campaign.status,
    placement: { id: placement.id, name: placement.name, type: placement.type, kind: placement.kind, aspectRatio: placement.aspectRatio, channelId: placement.channelId, meshName: placement.meshName },
    creative: publicCreative(creative),
    startsAt: campaign.startsAt?.toISOString() ?? null,
    endsAt: campaign.endsAt?.toISOString() ?? null,
    guaranteedUntil: campaign.guaranteedUntil?.toISOString() ?? null,
    pricePaidWei: campaign.paidPriceWei,
    endedReason: campaign.endedReason,
    durationSec: campaign.durationSec,
    fit: campaign.fit,
    clickUrl: campaign.clickUrl,
    wallet: opts.owner ? campaign.walletAddress : shortAddress(campaign.walletAddress),
    payment: payment
      ? { txHash: payment.txHash, txUrl: explorerTxUrl(payment.txHash), blockNumber: payment.blockNumber.toString(), amountWei: payment.amountWei, paymentToken: payment.paymentToken, status: payment.status, confirmedAt: payment.confirmedAt.toISOString(), chainId: payment.chainId }
      : null,
    airLogId: airLog?.id ?? null,
    rejectionReason: campaign.rejectionReason,
    activeQuoteId: opts.owner ? campaign.activeQuoteId : null,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

export async function listWalletCampaigns(walletAddress: string) {
  const rows = await db()
    .select({ campaign: schema.campaigns, placement: schema.placements, creative: schema.creatives, payment: schema.payments, airLog: schema.airLogs })
    .from(schema.campaigns)
    .innerJoin(schema.placements, eq(schema.campaigns.placementId, schema.placements.id))
    .leftJoin(schema.creatives, eq(schema.campaigns.creativeId, schema.creatives.id))
    .leftJoin(schema.payments, eq(schema.payments.campaignId, schema.campaigns.id))
    .leftJoin(schema.airLogs, eq(schema.airLogs.campaignId, schema.campaigns.id))
    .where(eq(schema.campaigns.walletAddress, walletAddress))
    .orderBy(desc(schema.campaigns.createdAt))
    .limit(50);
  return rows.map((r) => campaignView(r, { owner: true }));
}
