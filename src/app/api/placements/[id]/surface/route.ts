import { route, type Params } from "@/server/route";
import { json } from "@/server/http";
import { loadActivePlacement } from "@/server/ads/creatives";
import { getSurfaceState } from "@/server/ads/auction";
import { tickOpportunistically } from "@/server/worker/ticker";

export const dynamic = "force-dynamic";

/** The live ask for one surface: what it costs to take it right now. */
export const GET = route<Params<{ id: string }>>(async (_req, { params }) => {
  tickOpportunistically();
  const { id } = await params;
  const placement = await loadActivePlacement(id);
  return json(await getSurfaceState(placement));
});
