import { z } from "zod";
import { route } from "@/server/route";
import { json, parseBody, parseQuery, assertSameOrigin } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { getGuide, insertManualBlock, ensureScheduleHorizon } from "@/server/broadcast/schedule";
import { manualBlockSchema } from "@/server/admin/schemas";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";

const query = z.object({ channel: z.string().min(1).max(32).default("MAIN"), hours: z.coerce.number().min(1).max(72).default(12) });

export const GET = route(async (req) => {
  await requireAdmin();
  const { channel, hours } = parseQuery(req, query);
  return json(await getGuide(channel, hours));
});

/** Insert a manual block (interrupt / emergency / live HLS switch). */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  const input = await parseBody(req, manualBlockSchema);
  const block = await insertManualBlock({
    channelId: input.channelId,
    type: input.type,
    title: input.title,
    mediaUrl: input.mediaUrl ?? null,
    liveSourceId: input.liveSourceId ?? null,
    durationSec: input.durationSec,
    startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
  });
  await audit({ type: "ADMIN", id: admin.adminId }, "schedule.manual_block", { type: "programBlock", id: block.id }, { type: input.type, title: input.title, durationSec: input.durationSec });
  await ensureScheduleHorizon(input.channelId);
  return json({ block }, { status: 201 });
});
