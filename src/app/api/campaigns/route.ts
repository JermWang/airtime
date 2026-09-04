import { z } from "zod";
import { route } from "@/server/route";
import { json, parseBody, rateLimit, assertSameOrigin } from "@/server/http";
import { requireWallet } from "@/server/auth/session";
import { createCampaign, listWalletCampaigns, getCampaignDetail, campaignView } from "@/server/ads/campaigns";

export const dynamic = "force-dynamic";

const body = z.object({
  placementId: z.string().min(1).max(64),
  displayName: z.string().min(1).max(60),
  creativeId: z.string().uuid().optional().nullable(),
  fit: z.enum(["FIT", "FILL"]).optional(),
  clickUrl: z.string().url().max(2048).optional().nullable(),
});

export const GET = route(async () => {
  const wallet = await requireWallet();
  return json({ campaigns: await listWalletCampaigns(wallet.address) });
});

export const POST = route(async (req) => {
  rateLimit(req, "campaign-create", { limit: 30, windowSec: 60 });
  assertSameOrigin(req);
  const wallet = await requireWallet();
  const input = await parseBody(req, body);
  const campaign = await createCampaign({ walletAddress: wallet.address, ...input });
  const detail = await getCampaignDetail(campaign.id);
  return json(campaignView(detail!, { owner: true }), { status: 201 });
});
