import { z } from "zod";
import { route } from "@/server/route";
import { json, parseQuery } from "@/server/http";
import { getGuide } from "@/server/broadcast/schedule";

export const dynamic = "force-dynamic";

const query = z.object({ channel: z.string().min(1).max(32).default("MAIN"), hours: z.coerce.number().min(1).max(48).default(6) });

export const GET = route(async (req) => {
  const { channel, hours } = parseQuery(req, query);
  return json(await getGuide(channel, hours));
});
