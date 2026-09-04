import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { route, type Params } from "@/server/route";
import { json, parseBody, rateLimit, assertSameOrigin, HttpError } from "@/server/http";
import { requireWallet } from "@/server/auth/session";
import { getOwnedCampaign, getCampaignDetail, campaignView } from "@/server/ads/campaigns";
import { verifyQuoteByTxHash } from "@/server/chain/paymentVerifier";
import { db, schema } from "@/server/db/client";

export const dynamic = "force-dynamic";

const body = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

/**
 * The browser hints a transaction hash after the wallet reports a receipt.
 * The server verifies the on-chain event itself; the hash is only a lookup key.
 */
export const POST = route<Params<{ id: string }>>(async (req, { params }) => {
  rateLimit(req, "confirm", { limit: 60, windowSec: 60 });
  assertSameOrigin(req);
  const { id } = await params;
  const wallet = await requireWallet();
  const campaign = await getOwnedCampaign(id, wallet.address);
  const { txHash } = await parseBody(req, body);

  const quoteId =
    campaign.activeQuoteId ??
    (
      await db()
        .select({ id: schema.quotes.id })
        .from(schema.quotes)
        .where(and(eq(schema.quotes.campaignId, id)))
        .orderBy(desc(schema.quotes.createdAt))
        .limit(1)
    )[0]?.id;
  if (!quoteId) throw new HttpError(409, "Campaign has no quote to confirm");

  const outcome = await verifyQuoteByTxHash(quoteId, txHash as `0x${string}`);
  const detail = await getCampaignDetail(id);
  return json({ outcome, campaign: campaignView(detail!, { owner: true }) });
});
