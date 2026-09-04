import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { route } from "@/server/route";
import { json, parseQuery } from "@/server/http";
import { db, schema } from "@/server/db/client";

export const dynamic = "force-dynamic";

const query = z.object({ channel: z.string().min(1).max(32).default("MAIN") });

export const GET = route(async (req) => {
  const { channel } = parseQuery(req, query);
  const placements = await db()
    .select()
    .from(schema.placements)
    .where(and(eq(schema.placements.channelId, channel), eq(schema.placements.isActive, true)))
    .orderBy(asc(schema.placements.sortOrder));
  return json({ placements });
});
