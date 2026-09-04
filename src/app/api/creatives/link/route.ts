import { z } from "zod";
import { route } from "@/server/route";
import { json, parseBody, rateLimit, assertSameOrigin } from "@/server/http";
import { requireWallet } from "@/server/auth/session";
import { createLinkCreative, publicCreative } from "@/server/ads/creatives";

export const dynamic = "force-dynamic";

const body = z.object({
  placementId: z.string().min(1).max(40),
  url: z.string().url().max(2048),
});

/** Submit a show or spot that is hosted somewhere else. The station probes it. */
export const POST = route(async (req) => {
  rateLimit(req, "creative-link", { limit: 20, windowSec: 300 });
  assertSameOrigin(req);
  const wallet = await requireWallet();
  const { placementId, url } = await parseBody(req, body);
  const creative = await createLinkCreative({ walletAddress: wallet.address, placementId, url });
  return json(publicCreative(creative), { status: 201 });
});
