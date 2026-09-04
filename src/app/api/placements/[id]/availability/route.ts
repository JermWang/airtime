import { z } from "zod";
import { route, type Params } from "@/server/route";
import { json, parseQuery } from "@/server/http";
import { loadActivePlacement } from "@/server/ads/creatives";
import { computeAvailability } from "@/server/ads/availability";
import { serverNow, addSeconds } from "@/server/time/clock";

export const dynamic = "force-dynamic";

const query = z.object({
  duration: z.coerce.number().int().positive(),
  hours: z.coerce.number().min(1).max(72).default(24),
  from: z.string().datetime().optional(),
});

export const GET = route<Params<{ id: string }>>(async (req, { params }) => {
  const { id } = await params;
  const { duration, hours, from } = parseQuery(req, query);
  const placement = await loadActivePlacement(id);
  const start = from ? new Date(from) : serverNow();
  const result = await computeAvailability(placement, duration, { from: start, to: addSeconds(start, hours * 3600) });
  return json(result);
});
