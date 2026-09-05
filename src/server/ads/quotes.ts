import { randomBytes } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { hexToBigInt, type Address, type Hex } from "viem";
import { db, schema, type Tx } from "../db/client";
import { serverNow, addSeconds } from "../time/clock";
import { getSettings } from "../settings";
import { HttpError } from "../http";
import { activeHold, describeSurface, currentOccupant, askBreakdown } from "./auction";
import { creativeSellable } from "./creatives";
import { signQuote, placementIdHash } from "../chain/quoteSigner";
import { paymentContractAddress, publicClient } from "../chain/client";
import { activeChain, paymentAssets, paymentChains, chainById, NATIVE_TOKEN } from "@/lib/chain/chains";
import { treasuryAddress } from "../chain/treasuryTransfer";
import type { SignedQuoteWire, QuoteStruct } from "@/lib/chain/airtimePayments";
import { publish } from "../realtime/bus";
import { audit } from "../audit";
import type { Quote, PriceBreakdownLine } from "../db/schema";

/**
 * Authoritative quote engine.
 *
 * A quote is a signed promise to sell one surface at the ask that stood when it
 * was issued. It is created inside a single transaction that:
 *   1. locks the placement row (all purchases of that surface serialise here)
 *   2. re-validates the campaign and creative
 *   3. refuses if another buyer already holds this surface mid-purchase, or if
 *      the occupant's guaranteed runtime has not run out yet
 *   4. reads the ask off the descending clock
 *   5. writes a HELD reservation that expires with the quote (~3 minutes), so
 *      two buyers cannot pay the same ask for the same surface
 *   6. signs the EIP-712 quote with the backend signer
 *
 * `startAt`/`endAt` on the signed quote are the run's *guaranteed* window: the
 * buyer goes live at `startAt` and cannot be outbid before `endAt`. The run
 * itself continues past `endAt` until somebody pays more.
 */

export interface CreateQuoteInput {
  campaignId: string;
  walletAddress: `0x${string}`;
  paymentToken?: Address;
  /** Refuse to quote above this, in wei: protects a buyer from a takeover mid-click. */
  maxPriceWei?: bigint;
  /** Chain the buyer wants to pay on. Defaults to the station's own chain. */
  chainId?: number;
}

export interface QuoteResponse {
  quote: SignedQuoteWire;
  amountWei: string;
  breakdown: PriceBreakdownLine[];
  expiresAt: string;
  /** When the run starts (immediately) and the end of the guaranteed runtime. */
  startsAt: string;
  guaranteedUntil: string;
  guaranteedSeconds: number;
  campaignId: string;
  placementId: string;
  /** The occupant this purchase would displace, if any. */
  outbids: { displayName: string; pricePaidWei: string } | null;
  treasury: string | null;
  /** How this quote is paid: through the payment contract, or by a transfer to the treasury. */
  settlement: "contract" | "treasury";
  /** Address the transaction must be sent to. */
  payTo: string;
  chainId: number;
}


/** The chain a quote will be settled on, validated against the accepted list. */
function paymentChainFor(chainId?: number) {
  if (chainId === undefined) return paymentChains()[0];
  const chain = chainById(chainId);
  if (!chain) throw new HttpError(400, "That network is not accepted for payment");
  return chain;
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

  // New purchases must use the payment contract. A direct treasury transfer
  // cannot atomically reject a losing same-surface transaction, so issuing one
  // would make an automatic race refund impossible.
  const payChain = paymentChainFor(input.chainId);
  const contract = paymentContractAddress();
  if (!contract) throw new HttpError(503, "Protected payments are not configured on this station");
  if (payChain.id !== activeChain().id) {
    throw new HttpError(400, `Protected payments are not deployed on ${payChain.name}`);
  }
  const settlement = "contract" as const;
  const payTo = contract as Address;

  const paymentToken = (input.paymentToken ?? NATIVE_TOKEN).toLowerCase() as Address;
  const asset = paymentAssets().find((a) => a.address.toLowerCase() === paymentToken);
  if (!asset) throw new HttpError(400, "Payment asset is not enabled");
  if (!asset.isNative) {
    // ERC-20 pricing requires a configured conversion rate; nothing is invented.
    throw new HttpError(400, `${asset.symbol} payments are not enabled for quotes yet`);
  }

  const now = serverNow();

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

    // Lock the surface: every purchase of this inventory serialises here.
    const [placement] = await tx.select().from(schema.placements).where(eq(schema.placements.id, campaign.placementId)).for("update");
    if (!placement || !placement.isActive) throw new HttpError(404, "Placement is not available");

    const [creative] = await tx.select().from(schema.creatives).where(eq(schema.creatives.id, campaign.creativeId));
    if (!creative) throw new HttpError(400, "Creative not found");
    const sellable = creativeSellable(creative, placement);
    if (!sellable.ok) throw new HttpError(409, sellable.reason);

    await releaseCampaignHolds(tx, campaign.id);

    const occupant = await currentOccupant(placement.id, tx);
    if (occupant && occupant.id === campaign.id) throw new HttpError(409, "This campaign is already on the surface");
    const hold = await activeHold(placement.lane, now, tx, campaign.id);
    const surface = describeSurface(placement, occupant, hold, now);

    if (!surface.forSale) {
      throw new HttpError(409, surface.reason ?? "This surface cannot be bought right now", {
        status: surface.status,
        heldUntil: surface.heldUntil,
        askWei: surface.askWei,
      });
    }

    const amountWei = BigInt(surface.askWei);
    if (input.maxPriceWei !== undefined && amountWei > input.maxPriceWei) {
      throw new HttpError(409, "The ask moved above your limit before the quote was issued", { askWei: surface.askWei });
    }
    if (amountWei <= 0n) throw new HttpError(500, "Surface is misconfigured: the ask is zero");

    const guaranteedSeconds = Math.max(1, placement.auction.minHoldSeconds);
    const guaranteedUntil = addSeconds(now, guaranteedSeconds);
    const quoteId = `0x${randomBytes(32).toString("hex")}` as Hex;
    const nonce = hexToBigInt(`0x${randomBytes(16).toString("hex")}`);
    const expiresAt = addSeconds(now, settings.quoteHoldSeconds);
    const chainId = payChain.id;
    const pHash = placementIdHash(placement.id);

    const struct: QuoteStruct = {
      quoteId,
      buyer: input.walletAddress,
      placementId: pHash,
      creativeHash: creative.creativeHash as Hex,
      startAt: BigInt(Math.floor(now.getTime() / 1000)),
      endAt: BigInt(Math.floor(guaranteedUntil.getTime() / 1000)),
      paymentToken,
      amount: amountWei,
      expiresAt: BigInt(Math.floor(expiresAt.getTime() / 1000)),
      nonce,
    };
    const signature = await signQuote(struct, payTo, chainId);

    const [quote] = await tx
      .insert(schema.quotes)
      .values({
        id: quoteId,
        campaignId: campaign.id,
        walletAddress: input.walletAddress,
        placementId: placement.id,
        placementIdHash: pHash,
        creativeHash: creative.creativeHash,
        startsAt: now,
        endsAt: guaranteedUntil,
        paymentToken,
        amountWei: amountWei.toString(),
        expiresAt,
        nonce: nonce.toString(),
        chainId,
        contractAddress: payTo,
        signature,
        priceBreakdown: askBreakdown(placement, surface, now),
        status: "ACTIVE",
        issuedAtBlock,
      })
      .returning();

    await tx.insert(schema.reservations).values({
      placementId: placement.id,
      lane: placement.lane,
      campaignId: campaign.id,
      quoteId,
      startsAt: now,
      endsAt: expiresAt,
      status: "HELD",
      expiresAt,
    });

    await tx
      .update(schema.campaigns)
      .set({ status: "AWAITING_PAYMENT", activeQuoteId: quoteId, updatedAt: now })
      .where(eq(schema.campaigns.id, campaign.id));

    await audit({ type: "WALLET", id: input.walletAddress }, "quote.created", { type: "campaign", id: campaign.id }, { quoteId, amountWei: amountWei.toString(), outbids: occupant?.id ?? null }, tx);

    publish({ type: "campaign.updated", campaignId: campaign.id, status: "AWAITING_PAYMENT", placementId: placement.id });
    publish({ type: "placement.updated", placementId: placement.id });

    return {
      quote: toWire(quote),
      amountWei: amountWei.toString(),
      breakdown: quote.priceBreakdown,
      expiresAt: expiresAt.toISOString(),
      startsAt: now.toISOString(),
      guaranteedUntil: guaranteedUntil.toISOString(),
      guaranteedSeconds,
      campaignId: campaign.id,
      placementId: placement.id,
      outbids: occupant ? { displayName: occupant.displayName, pricePaidWei: occupant.paidPriceWei ?? "0" } : null,
      treasury: treasuryAddress(),
      settlement,
      payTo,
      chainId: payChain.id,
    };
  });
}

/** Release surfaces held by quotes whose hold window has passed. */
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
      publish({ type: "placement.updated", placementId: q.placementId });
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
