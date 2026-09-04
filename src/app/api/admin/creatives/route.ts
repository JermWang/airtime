import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { route } from "@/server/route";
import { json, parseQuery } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { publicCreative } from "@/server/ads/creatives";

export const dynamic = "force-dynamic";

const query = z.object({ status: z.enum(["PENDING", "VALID", "INVALID", "APPROVED", "REJECTED", "ALL"]).default("VALID") });

export const GET = route(async (req) => {
  await requireAdmin();
  const { status } = parseQuery(req, query);
  const rows = await db()
    .select()
    .from(schema.creatives)
    .where(status === "ALL" ? inArray(schema.creatives.status, ["PENDING", "VALID", "INVALID", "APPROVED", "REJECTED"]) : eq(schema.creatives.status, status))
    .orderBy(desc(schema.creatives.createdAt))
    .limit(200);
  return json({ creatives: rows.map((c) => ({ ...publicCreative(c), wallet: c.walletAddress, placementId: (c.metadata as { placementId?: string }).placementId ?? null, moderationNote: c.moderationNote, originalFilename: c.originalFilename, sizeBytes: c.sizeBytes })) });
});
