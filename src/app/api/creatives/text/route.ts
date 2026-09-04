import { z } from "zod";
import { route } from "@/server/route";
import { json, parseBody, rateLimit, assertSameOrigin } from "@/server/http";
import { requireWallet } from "@/server/auth/session";
import { createTextCreative, publicCreative } from "@/server/ads/creatives";

export const dynamic = "force-dynamic";

const body = z.object({ placementId: z.string().min(1).max(64), text: z.string().min(1).max(500), clickUrl: z.string().url().max(2048).optional().nullable() });

export const POST = route(async (req) => {
  rateLimit(req, "creative-text", { limit: 30, windowSec: 60 });
  assertSameOrigin(req);
  const wallet = await requireWallet();
  const input = await parseBody(req, body);
  const creative = await createTextCreative({ walletAddress: wallet.address, placementId: input.placementId, text: input.text, clickUrl: input.clickUrl ?? null });
  return json({ creative: publicCreative(creative) }, { status: 201 });
});
