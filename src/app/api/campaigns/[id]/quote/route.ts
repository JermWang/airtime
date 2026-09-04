import { z } from "zod";
import { eq } from "drizzle-orm";
import { route, type Params } from "@/server/route";
import { json, parseBody, rateLimit, assertSameOrigin, notFound } from "@/server/http";
import { requireWallet } from "@/server/auth/session";
import { createQuote, getActiveQuoteForCampaign, toWire } from "@/server/ads/quotes";
import { getOwnedCampaign } from "@/server/ads/campaigns";
import { db, schema } from "@/server/db/client";

export const dynamic = "force-dynamic";

const body = z.object({
  startsAt: z.string().datetime(),
  durationSec: z.number().int().positive().max(86400),
  paymentToken: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
});

/** Issue (or re-issue) an authoritative signed quote and hold the inventory. */
export const POST = route<Params<{ id: string }>>(async (req, { params }) => {
  rateLimit(req, "quote", { limit: 20, windowSec: 60 });
  assertSameOrigin(req);
  const { id } = await params;
  const wallet = await requireWallet();
  const input = await parseBody(req, body);
  const result = await createQuote({
    campaignId: id,
    walletAddress: wallet.address,
    startsAt: new Date(input.startsAt),
    durationSec: input.durationSec,
    paymentToken: input.paymentToken as `0x${string}` | undefined,
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
    endsAt: quote.endsAt.toISOString(),
    campaignId: id,
    placementId: placement?.id ?? quote.placementId,
    treasury: process.env.TREASURY_ADDRESS || null,
  });
});
