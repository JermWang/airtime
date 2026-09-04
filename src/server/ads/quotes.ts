import { randomBytes } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { hexToBigInt, type Address, type Hex } from "viem";
import { db, schema, type Tx } from "../db/client";
import { serverNow, addSeconds } from "../time/clock";
import { getSettings } from "../settings";
import { HttpError } from "../http";
import { findConflicts, validateWindow, laneOccupancy } from "./availability";
import { computePrice } from "./pricing";
import { creativeSellable } from "./creatives";
import { blocksInRange } from "../broadcast/schedule";
import { signQuote, placementIdHash } from "../chain/quoteSigner";
import { paymentContractAddress, publicClient } from "../chain/client";
import { activeChain, paymentAssets, NATIVE_TOKEN } from "@/lib/chain/chains";
import type { SignedQuoteWire, QuoteStruct } from "@/lib/chain/airtimePayments";
import { publish } from "../realtime/bus";
import { audit } from "../audit";
import type { Quote, PriceBreakdownLine } from "../db/schema";

/**
 * Authoritative quote engine.
 *
 * A quote is created inside a single database transaction that:
 *   1. locks the placement row (serialises all bookings for that inventory)
 *   2. re-validates the campaign, creative and requested window
 *   3. checks the lane for overlapping HELD/CONFIRMED reservations
 *   4. prices the window
 *   5. writes a HELD reservation that expires with the quote (~3 minutes)
 *   6. signs the EIP-712 quote with the backend signer
 *
 * Expired quotes release their inventory in `expireQuotes()`, called by the ticker.
 */

export interface CreateQuoteInput {
  campaignId: string;
  walletAddress: `0x${string}`;
  startsAt: Date;
  durationSec: number;
  paymentToken?: Address;
}

export interface QuoteResponse {
  quote: SignedQuoteWire;
  amountWei: string;
  breakdown: PriceBreakdownLine[];
  expiresAt: string;
  startsAt: string;
  endsAt: string;
  campaignId: string;
  placementId: string;
  treasury: string | null;
}

export function toWire(q: Quote): SignedQuoteWire {
  return {
    quoteId: q.id as Hex,
    buyer: q.walletAddress as Address,
    placementId: q.placementIdHash as Hex,
    creativeHash: q.creativeHash as Hex,
    startAt: Math.floor(q.startsAt.getTime() / 1000).toString(),
    endAt: Math.floor(q.endsAt.getTime() / 1000).toString(),
    paymentToken: q.paymentToken as Address,
    amount: q.amountWei,
    expiresAt: Math.floor(q.expiresAt.getTime() / 1000).toString(),
    nonce: q.nonce,
    signature: q.signature as Hex,
    chainId: q.chainId,
    contract: q.contractAddress as Address,
  };
}

async function releaseCampaignHolds(tx: Tx, campaignId: string): Promise<void> {
  await tx
    .update(schema.reservations)
    .set({ status: "RELEASED" })
    .where(and(eq(schema.reservations.campaignId, campaignId), eq(schema.reservations.status, "HELD")));
  await tx
    .update(schema.quotes)
    .set({ status: "CANCELLED" })
    .where(and(eq(schema.quotes.campaignId, campaignId), eq(schema.quotes.status, "ACTIVE")));
}

export async function createQuote(input: CreateQuoteInput): Promise<QuoteResponse> {
  const settings = await getSettings();
  if (settings.purchasesPaused) throw new HttpError(503, "Purchases are temporarily paused by the station");

  const contract = paymentContractAddress();
  if (!contract) throw new HttpError(503, "Payment contract is not configured");

  const paymentToken = (input.paymentToken ?? NATIVE_TOKEN).toLowerCase() as Address;
  const asset = paymentAssets().find((a) => a.address.toLowerCase() === paymentToken);
  if (!asset) throw new HttpError(400, "Payment asset is not enabled");
  if (!asset.isNative) {
    // ERC-20 pricing requires a configured conversion rate; nothing is invented.
    throw new HttpError(400, `${asset.symbol} payments are not enabled for quotes yet`);
  }

  const now = serverNow();
  const endsAt = addSeconds(input.startsAt, input.durationSec);

  // Best effort chain height so the payment watcher only scans recent blocks.
  let issuedAtBlock: bigint | null = null;
  try {
    issuedAtBlock = await publicClient().getBlockNumber();
  } catch {
    issuedAtBlock = null;
  }

  return db().transaction(async (tx) => {
    const [campaign] = await tx
      .select()
      .from(schema.campaigns)
      .where(and(eq(schema.campaigns.id, input.campaignId), eq(schema.campaigns.walletAddress, input.walletAddress)));
    if (!campaign) throw new HttpError(404, "Campaign not found");
    if (!["DRAFT", "VALIDATING", "READY_TO_PURCHASE", "AWAITING_PAYMENT"].includes(campaign.status)) {
      throw new HttpError(409, `Campaign is ${campaign.status.replace(/_/g, " ").toLowerCase()} and cannot be quoted`);
    }
    if (!campaign.creativeId) throw new HttpError(400, "Attach a creative before requesting a quote");

    // Lock the placement: all quotes for this inventory serialise here.
    const [placement] = await tx.select().from(schema.placements).where(eq(schema.placements.id, campaign.placementId)).for("update");
    if (!placement || !placement.isActive) throw new HttpError(404, "Placement is not available");

    const [creative] = await tx.select().from(schema.creatives).where(eq(schema.creatives.id, campaign.creativeId));
    if (!creative) throw new HttpError(400, "Creative not found");
    const sellable = creativeSellable(creative, placement);
    if (!sellable.ok) throw new HttpError(409, sellable.reason);

    const window = await validateWindow(placement, input.startsAt, endsAt, tx);
    if (!window.ok) throw new HttpError(400, window.reason);

    await releaseCampaignHolds(tx, campaign.id);

    const conflicts = await findConflicts(placement.lane, input.startsAt, endsAt, now, tx, campaign.id);
    if (conflicts.length) {
      const sold = conflicts.some((c) => c.status === "CONFIRMED");
      throw new HttpError(409, sold ? "This airtime is sold out" : "This airtime is currently reserved by another buyer", { status: sold ? "SOLD_OUT" : "RESERVED" });
    }

    const occupancyRatio = await laneOccupancy(placement, input.startsAt, tx);
    const overlapping = await blocksInRange(placement.channelId, input.startsAt, endsAt, tx);
    const overlapsPremiumProgram = overlapping.some((b) => Boolean((b.metadata as { isPremium?: boolean }).isPremium));
    const price = computePrice({ placement, startsAt: input.startsAt, endsAt, now, occupancyRatio, overlapsPremiumProgram });

    const quoteId = `0x${randomBytes(32).toString("hex")}` as Hex;
    const nonce = hexToBigInt(`0x${randomBytes(16).toString("hex")}`);
    const expiresAt = addSeconds(now, settings.quoteHoldSeconds);
    const chainId = activeChain().id;
    const pHash = placementIdHash(placement.id);

    const struct: QuoteStruct = {
      quoteId,
      buyer: input.walletAddress,
      placementId: pHash,
      creativeHash: creative.creativeHash as Hex,
      startAt: BigInt(Math.floor(input.startsAt.getTime() / 1000)),
      endAt: BigInt(Math.floor(endsAt.getTime() / 1000)),
      paymentToken,
      amount: price.amountWei,
      expiresAt: BigInt(Math.floor(expiresAt.getTime() / 1000)),
      nonce,
    };
    const signature = await signQuote(struct, contract, chainId);

    const [quote] = await tx
      .insert(schema.quotes)
      .values({
        id: quoteId,
        campaignId: campaign.id,
        walletAddress: input.walletAddress,
        placementId: placement.id,
        placementIdHash: pHash,
        creativeHash: creative.creativeHash,
        startsAt: input.startsAt,
        endsAt,
        paymentToken,
        amountWei: price.amountWei.toString(),
        expiresAt,
        nonce: nonce.toString(),
        chainId,
        contractAddress: contract,
        signature,
        priceBreakdown: price.breakdown,
        status: "ACTIVE",
        issuedAtBlock,
      })
      .returning();

    await tx.insert(schema.reservations).values({
      placementId: placement.id,
      lane: placement.lane,
      campaignId: campaign.id,
      quoteId,
      startsAt: input.startsAt,
      endsAt,
      status: "HELD",
      expiresAt,
    });

    await tx
      .update(schema.campaigns)
      .set({ status: "AWAITING_PAYMENT", startsAt: input.startsAt, endsAt, durationSec: input.durationSec, activeQuoteId: quoteId, updatedAt: now })
      .where(eq(schema.campaigns.id, campaign.id));

    await audit({ type: "WALLET", id: input.walletAddress }, "quote.created", { type: "campaign", id: campaign.id }, { quoteId, amountWei: price.amountWei.toString(), startsAt: input.startsAt.toISOString(), endsAt: endsAt.toISOString() }, tx);

    publish({ type: "campaign.updated", campaignId: campaign.id, status: "AWAITING_PAYMENT", placementId: placement.id });

    const treasury = process.env.TREASURY_ADDRESS || null;
    return {
      quote: toWire(quote),
      amountWei: price.amountWei.toString(),
      breakdown: price.breakdown,
      expiresAt: expiresAt.toISOString(),
      startsAt: input.startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      campaignId: campaign.id,
      placementId: placement.id,
      treasury,
    };
  });
}

/** Release inventory held by quotes whose hold window has passed. */
export async function expireQuotes(now = serverNow()): Promise<number> {
  return db().transaction(async (tx) => {
    const expired = await tx
      .select()
      .from(schema.quotes)
      .where(and(eq(schema.quotes.status, "ACTIVE"), lt(schema.quotes.expiresAt, now)));
    if (!expired.length) return 0;
    const ids = expired.map((q) => q.id);
    await tx.update(schema.quotes).set({ status: "EXPIRED" }).where(inArray(schema.quotes.id, ids));
    await tx
      .update(schema.reservations)
      .set({ status: "RELEASED" })
      .where(and(inArray(schema.reservations.quoteId, ids), eq(schema.reservations.status, "HELD")));
    for (const q of expired) {
      const [campaign] = await tx.select().from(schema.campaigns).where(eq(schema.campaigns.id, q.campaignId));
      if (campaign && campaign.status === "AWAITING_PAYMENT" && campaign.activeQuoteId === q.id) {
        await tx
          .update(schema.campaigns)
          .set({ status: "READY_TO_PURCHASE", activeQuoteId: null, updatedAt: now })
          .where(eq(schema.campaigns.id, campaign.id));
        publish({ type: "campaign.updated", campaignId: campaign.id, status: "READY_TO_PURCHASE", placementId: campaign.placementId });
      }
    }
    return expired.length;
  });
}

export async function getActiveQuoteForCampaign(campaignId: string): Promise<Quote | null> {
  const [q] = await db()
    .select()
    .from(schema.quotes)
    .where(and(eq(schema.quotes.campaignId, campaignId), eq(schema.quotes.status, "ACTIVE")));
  return q ?? null;
}
