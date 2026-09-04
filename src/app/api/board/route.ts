import { z } from "zod";
import { route } from "@/server/route";
import { tickOpportunistically } from "@/server/worker/ticker";
import { json, parseQuery } from "@/server/http";
import { getBoard } from "@/server/ads/campaigns";

export const dynamic = "force-dynamic";

const query = z.object({ channel: z.string().min(1).max(32).default("MAIN") });

/** Every surface, its live ask, and whoever is standing on it. */
export const GET = route(async (req) => {
  tickOpportunistically();
  const { channel } = parseQuery(req, query);
  return json(await getBoard(channel));
});
