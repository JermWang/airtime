import { z } from "zod";
import { route } from "@/server/route";
import { json, parseQuery } from "@/server/http";
import { getActiveActivations } from "@/server/ads/campaigns";

export const dynamic = "force-dynamic";

const query = z.object({ channel: z.string().min(1).max(32).default("MAIN") });

export const GET = route(async (req) => {
  const { channel } = parseQuery(req, query);
  return json(await getActiveActivations(channel));
});
