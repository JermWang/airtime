import { z } from "zod";
import { route } from "@/server/route";
import { json, parseBody, rateLimit, assertSameOrigin } from "@/server/http";
import { requireWallet } from "@/server/auth/session";
import { issueUploadTicket } from "@/server/auth/uploadTicket";
import { loadActivePlacement } from "@/server/ads/creatives";

export const dynamic = "force-dynamic";

const body = z.object({ placementId: z.string().min(1).max(64) });

export const POST = route(async (req) => {
  rateLimit(req, "upload-ticket", { limit: 30, windowSec: 60 });
  assertSameOrigin(req);
  const wallet = await requireWallet();
  const { placementId } = await parseBody(req, body);
  const placement = await loadActivePlacement(placementId);
  return json({
    ticket: issueUploadTicket(wallet.address, placement.id),
    limits: { maxFileBytes: placement.maxFileBytes, maxWidth: placement.maxWidth, maxHeight: placement.maxHeight, mediaTypes: placement.mediaTypes, maxCreativeSec: placement.maxCreativeSec },
  });
});
