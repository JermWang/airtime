import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { route, type Params } from "@/server/route";
import { json, parseBody, rateLimit, assertSameOrigin, notFound, HttpError } from "@/server/http";
import { requireWallet } from "@/server/auth/session";
import { createQuote, getActiveQuoteForCampaign, toWire } from "@/server/ads/quotes";
import { getOwnedCampaign } from "@/server/ads/campaigns";
import { db, schema } from "@/server/db/client";
import { treasuryAddress } from "@/server/chain/treasuryTransfer";

export const dynamic = "force-dynamic";

/** Release an unsigned quote before editing the reviewed ad. */
export const DELETE = route<Params<{ id: string }>>(async (req, { params }) => {
  assertSameOrigin(req);
  const wallet = await requireWallet();
  const { id } = await params;
  const owned = await getOwnedCampaign(id, wallet.address);
  await db().transaction(async tx => {
    await tx.select().from(schema.placements).where(eq(schema.placements.id, owned.placementId)).for("update");
    const [campaign] = await tx.select().from(schema.campaigns).where(eq(schema.campaigns.id, id)).for("update");
    if (!["DRAFT", "VALIDATING", "READY_TO_PURCHASE", "AWAITING_PAYMENT"].includes(campaign.status)) throw new HttpError(409, "A paid ad cannot be changed here.");
    const quotes = await tx.select().from(schema.quotes).where(eq(schema.quotes.campaignId, id)).for("update");
    if (quotes.some(q => q.txHint && !q.txError)) throw new HttpError(409, "Payment is being checked. Do not edit or pay again yet.");
    await tx.update(schema.quotes).set({ status: "CANCELLED" }).where(and(eq(schema.quotes.campaignId, id), eq(schema.quotes.status, "ACTIVE")));
    await tx.update(schema.reservations).set({ status: "RELEASED" }).where(and(eq(schema.reservations.campaignId, id), eq(schema.reservations.status, "HELD")));
    if (campaign.status === "AWAITING_PAYMENT") await tx.update(schema.campaigns).set({ status: "READY_TO_PURCHASE", activeQuoteId: null, updatedAt: new Date() }).where(eq(schema.campaigns.id, id));
  });
  return json({ ok: true });
});

const body = z.object({
  /** Refuse the quote if the ask has moved above this, in wei. */
  maxPriceWei: z.string().regex(/^\d+$/).optional(),
  paymentToken: z.literal("SOL").optional(),
  /** Network the buyer wants to pay from. Validated against the accepted list. */
  chainId: z.coerce.number().int().positive().optional(),
});

/** Issue (or re-issue) a signed quote at the surface's current ask and hold it. */
export const POST = route<Params<{ id: string }>>(async (req, { params }) => {
  rateLimit(req, "quote", { limit: 20, windowSec: 60 });
  assertSameOrigin(req);
  const { id } = await params;
  const wallet = await requireWallet();
  const input = await parseBody(req, body);
  const result = await createQuote({
    campaignId: id,
    walletAddress: wallet.address,
    maxPriceWei: input.maxPriceWei ? BigInt(input.maxPriceWei) : undefined,
    paymentToken: input.paymentToken,
    chainId: input.chainId,
  });
  return json(result, { status: 201 });
});

/** Current active quote for the owner (used to resume a payment after reload). */
export const GET = route<Params<{ id: string }>>(async (_req, { params }) => {
  const { id } = await params;
  const wallet = await requireWallet();
  await getOwnedCampaign(id, wallet.address);
  const quote = await getActiveQuoteForCampaign(id);
  if (!quote) notFound("No active quote");
  const [placement] = await db().select().from(schema.placements).where(eq(schema.placements.id, quote.placementId));
  return json({
    quote: toWire(quote),
    amountWei: quote.amountWei,
    breakdown: quote.priceBreakdown,
    expiresAt: quote.expiresAt.toISOString(),
    startsAt: quote.startsAt.toISOString(),
    guaranteedUntil: quote.endsAt.toISOString(),
    guaranteedSeconds: Math.max(1, Math.round((quote.endsAt.getTime() - quote.startsAt.getTime()) / 1000)),
    campaignId: id,
    placementId: placement?.id ?? quote.placementId,
    outbids: null,
    treasury: treasuryAddress(),
    settlement: "solana",
    payTo: quote.contractAddress,
    chainId: quote.chainId,
    paymentSubmitted: Boolean(quote.txHint && !quote.txError),
  });
});
