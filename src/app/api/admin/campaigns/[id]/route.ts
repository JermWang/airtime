import { z } from "zod";
import { route, type Params } from "@/server/route";
import { json, parseBody, assertSameOrigin } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { adminSetCampaignStatus, getCampaignDetail, campaignView } from "@/server/ads/campaigns";

export const dynamic = "force-dynamic";

const body = z.object({ status: z.enum(["REJECTED", "REFUNDED", "CANCELLED"]), reason: z.string().max(500).optional() });

export const PATCH = route<Params<{ id: string }>>(async (req, { params }) => {
  assertSameOrigin(req);
  const { id } = await params;
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  const { status, reason } = await parseBody(req, body);
  await adminSetCampaignStatus(id, status, { type: "ADMIN", id: admin.adminId }, reason);
  const detail = await getCampaignDetail(id);
  return json(campaignView(detail!, { owner: true }));
});
