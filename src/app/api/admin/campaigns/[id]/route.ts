import { z } from "zod";
import type { Hex } from "viem";
import { route, type Params } from "@/server/route";
import { json, parseBody, assertSameOrigin } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { adminSetCampaignStatus, getCampaignDetail, campaignView } from "@/server/ads/campaigns";

export const dynamic = "force-dynamic";

const body = z
  .object({
    status: z.enum(["REJECTED", "REFUNDED", "CANCELLED"]),
    reason: z.string().max(500).optional(),
    refundTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid refund transaction hash").optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "REFUNDED" && !value.refundTxHash) {
      ctx.addIssue({ code: "custom", path: ["refundTxHash"], message: "A refund transaction hash is required" });
    }
  });

export const PATCH = route<Params<{ id: string }>>(async (req, { params }) => {
  assertSameOrigin(req);
  const { id } = await params;
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  const { status, reason, refundTxHash } = await parseBody(req, body);
  await adminSetCampaignStatus(id, status, { type: "ADMIN", id: admin.adminId }, { reason, refundTxHash: refundTxHash as Hex | undefined });
  const detail = await getCampaignDetail(id);
  return json(campaignView(detail!, { owner: true }));
});
