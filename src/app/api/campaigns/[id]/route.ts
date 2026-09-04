import { z } from "zod";
import { route, type Params } from "@/server/route";
import { json, parseBody, assertSameOrigin, notFound } from "@/server/http";
import { getWalletSession, requireWallet } from "@/server/auth/session";
import { getCampaignDetail, campaignView, updateCampaignDraft, cancelCampaign } from "@/server/ads/campaigns";

export const dynamic = "force-dynamic";

const patch = z.object({
  creativeId: z.string().uuid().optional().nullable(),
  displayName: z.string().min(1).max(60).optional(),
  fit: z.enum(["FIT", "FILL"]).optional(),
  clickUrl: z.string().url().max(2048).optional().nullable(),
});

const idSchema = z.string().uuid();

export const GET = route<Params<{ id: string }>>(async (_req, { params }) => {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const detail = await getCampaignDetail(id);
  if (!detail) notFound();
  const session = await getWalletSession();
  const owner = Boolean(session && session.address === detail.campaign.walletAddress);
  return json(campaignView(detail, { owner }));
});

export const PATCH = route<Params<{ id: string }>>(async (req, { params }) => {
  assertSameOrigin(req);
  const { id } = await params;
  const wallet = await requireWallet();
  const input = await parseBody(req, patch);
  await updateCampaignDraft(id, wallet.address, input);
  const detail = await getCampaignDetail(id);
  return json(campaignView(detail!, { owner: true }));
});

export const DELETE = route<Params<{ id: string }>>(async (req, { params }) => {
  assertSameOrigin(req);
  const { id } = await params;
  const wallet = await requireWallet();
  await cancelCampaign(id, wallet.address);
  const detail = await getCampaignDetail(id);
  return json(campaignView(detail!, { owner: true }));
});
