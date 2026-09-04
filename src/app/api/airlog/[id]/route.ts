import { z } from "zod";
import { eq, or } from "drizzle-orm";
import { route, type Params } from "@/server/route";
import { json, notFound } from "@/server/http";
import { db, schema } from "@/server/db/client";
import { publicCreative } from "@/server/ads/creatives";
import { explorerTxUrl, activeChain } from "@/lib/chain/chains";
import { shortAddress } from "@/lib/format";

export const dynamic = "force-dynamic";

/** AirLog receipt by AirLog id or campaign id. */
export const GET = route<Params<{ id: string }>>(async (_req, { params }) => {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [row] = await db()
    .select({ log: schema.airLogs, campaign: schema.campaigns, placement: schema.placements, creative: schema.creatives })
    .from(schema.airLogs)
    .innerJoin(schema.campaigns, eq(schema.airLogs.campaignId, schema.campaigns.id))
    .innerJoin(schema.placements, eq(schema.airLogs.placementId, schema.placements.id))
    .leftJoin(schema.creatives, eq(schema.airLogs.creativeId, schema.creatives.id))
    .where(or(eq(schema.airLogs.id, id), eq(schema.airLogs.campaignId, id)));
  if (!row) notFound("AirLog not found");
  const { log, campaign, placement, creative } = row;
  return json({
    id: log.id,
    campaignId: campaign.id,
    displayName: campaign.displayName,
    placement: { id: placement.id, name: placement.name, type: placement.type, kind: placement.kind, aspectRatio: placement.aspectRatio },
    channelId: log.channelId,
    creative: publicCreative(creative),
    scheduledStart: log.scheduledStart.toISOString(),
    scheduledEnd: log.scheduledEnd.toISOString(),
    actualStart: log.actualStart?.toISOString() ?? null,
    actualEnd: log.actualEnd?.toISOString() ?? null,
    wallet: shortAddress(log.walletAddress),
    walletFull: log.walletAddress,
    payment: log.txHash
      ? { txHash: log.txHash, txUrl: explorerTxUrl(log.txHash), blockNumber: log.blockNumber?.toString() ?? null, amountWei: log.amountWei, paymentToken: log.paymentToken, chainId: log.chainId ?? activeChain().id, chainName: activeChain().name }
      : null,
    playbackStatus: log.playbackStatus,
    analytics: log.analytics,
    createdAt: log.createdAt.toISOString(),
  });
});
