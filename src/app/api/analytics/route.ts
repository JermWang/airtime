import { z } from "zod";
import { route } from "@/server/route";
import { json, parseBody, rateLimit, assertSameOrigin } from "@/server/http";
import { recordEvents, ANALYTICS_TYPES } from "@/server/analytics/record";

export const dynamic = "force-dynamic";

const body = z.object({
  sessionId: z.string().min(8).max(64),
  events: z
    .array(
      z.object({
        campaignId: z.string().uuid(),
        placementId: z.string().min(1).max(64),
        type: z.enum(ANALYTICS_TYPES as [string, ...string[]]),
        value: z.number().int().optional().nullable(),
      }),
    )
    .min(1)
    .max(50),
});

export const POST = route(async (req) => {
  rateLimit(req, "analytics", { limit: 120, windowSec: 60 });
  assertSameOrigin(req);
  const input = await parseBody(req, body);
  const accepted = await recordEvents(input.sessionId, input.events as Parameters<typeof recordEvents>[1]);
  return json({ accepted });
});
