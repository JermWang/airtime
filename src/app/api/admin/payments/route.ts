import { desc, eq } from "drizzle-orm";
import { route } from "@/server/route";
import { json } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { explorerTxUrl } from "@/lib/chain/chains";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  const rows = await db()
    .select({ payment: schema.payments, campaign: schema.campaigns })
    .from(schema.payments)
    .innerJoin(schema.campaigns, eq(schema.payments.campaignId, schema.campaigns.id))
    .orderBy(desc(schema.payments.confirmedAt))
    .limit(200);
  return json({
    payments: rows.map(({ payment, campaign }) => ({
      id: payment.id,
      campaignId: campaign.id,
      campaignName: campaign.displayName,
      placementId: campaign.placementId,
      quoteId: payment.quoteId,
      txHash: payment.txHash,
      txUrl: explorerTxUrl(payment.txHash),
      blockNumber: payment.blockNumber.toString(),
      buyer: payment.buyer,
      paymentToken: payment.paymentToken,
      amountWei: payment.amountWei,
      status: payment.status,
      confirmedAt: payment.confirmedAt.toISOString(),
      chainId: payment.chainId,
    })),
  });
});
