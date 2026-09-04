import { z } from "zod";
import { eq } from "drizzle-orm";
import { route, type Params } from "@/server/route";
import { json, parseBody, rateLimit, assertSameOrigin, notFound } from "@/server/http";
import { requireWallet } from "@/server/auth/session";
import { createQuote, getActiveQuoteForCampaign, toWire } from "@/server/ads/quotes";
import { getOwnedCampaign } from "@/server/ads/campaigns";
import { db, schema } from "@/server/db/client";
import { treasuryAddress } from "@/server/chain/treasuryTransfer";

export const dynamic = "force-dynamic";

const body = z.object({
  /** Refuse the quote if the ask has moved above this, in wei. */
  maxPriceWei: z.string().regex(/^\d+$/).optional(),
  paymentToken: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
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
    paymentToken: input.paymentToken as `0x${string}` | undefined,
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
    settlement: quote.contractAddress.toLowerCase() === treasuryAddress().toLowerCase() ? "treasury" : "contract",
    payTo: quote.contractAddress,
    chainId: quote.chainId,
  });
});
