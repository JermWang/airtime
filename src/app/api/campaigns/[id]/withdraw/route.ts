import { route, type Params } from "@/server/route";
import { json, assertSameOrigin, rateLimit } from "@/server/http";
import { requireWallet } from "@/server/auth/session";
import { withdrawCampaign, getCampaignDetail, campaignView } from "@/server/ads/campaigns";

export const dynamic = "force-dynamic";

/**
 * Give the surface back early. Nothing is refunded: the runtime bought was
 * delivered, and the surface simply starts asking again from where it cleared.
 */
export const POST = route<Params<{ id: string }>>(async (req, { params }) => {
  rateLimit(req, "withdraw", { limit: 10, windowSec: 60 });
  assertSameOrigin(req);
  const { id } = await params;
  const wallet = await requireWallet();
  await withdrawCampaign(id, wallet.address);
  const detail = await getCampaignDetail(id);
  return json(campaignView(detail!, { owner: true }));
});
