import { z } from "zod";
import { route } from "@/server/route";
import { json, parseBody, assertSameOrigin, HttpError } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { getSettings, setSetting } from "@/server/settings";
import { audit } from "@/server/audit";
import { simulationClockAllowed } from "@/server/env";

export const dynamic = "force-dynamic";

const body = z.object({
  purchasesPaused: z.boolean().optional(),
  clockOffsetMs: z.number().int().min(-365 * 86400 * 1000).max(365 * 86400 * 1000).optional(),
  quoteHoldSeconds: z.number().int().min(30).max(1800).optional(),
  defaultChannelId: z.string().min(1).max(32).optional(),
  treasuryAllocationBps: z.number().int().min(0).max(10_000).optional(),
});

export const GET = route(async () => {
  await requireAdmin();
  return json({ settings: await getSettings(), simulationClockAllowed: simulationClockAllowed() });
});

export const PATCH = route(async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  const input = await parseBody(req, body);
  if (input.clockOffsetMs !== undefined && !simulationClockAllowed()) throw new HttpError(403, "The simulation clock is disabled on this deployment");
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    await setSetting(key as keyof typeof input, value as never);
  }
  await audit({ type: "ADMIN", id: admin.adminId }, "settings.update", null, input);
  return json({ settings: await getSettings() });
});
