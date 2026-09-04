import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { route } from "@/server/route";
import { json, parseQuery } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { campaignView } from "@/server/ads/campaigns";

export const dynamic = "force-dynamic";

const query = z.object({ status: z.string().max(40).default("ACTIVE") });

const ACTIVE = ["AWAITING_PAYMENT", "PAID", "QUEUED", "AIRING"] as const;

export const GET = route(async (req) => {
  await requireAdmin();
  const { status } = parseQuery(req, query);
  const where = status === "ALL" ? undefined : status === "ACTIVE" ? inArray(schema.campaigns.status, [...ACTIVE]) : eq(schema.campaigns.status, status as (typeof ACTIVE)[number]);
  const rows = await db()
    .select({ campaign: schema.campaigns, placement: schema.placements, creative: schema.creatives, payment: schema.payments, airLog: schema.airLogs })
    .from(schema.campaigns)
    .innerJoin(schema.placements, eq(schema.campaigns.placementId, schema.placements.id))
    .leftJoin(schema.creatives, eq(schema.campaigns.creativeId, schema.creatives.id))
    .leftJoin(schema.payments, eq(schema.payments.campaignId, schema.campaigns.id))
    .leftJoin(schema.airLogs, eq(schema.airLogs.campaignId, schema.campaigns.id))
    .where(where)
    .orderBy(desc(schema.campaigns.updatedAt))
    .limit(200);
  return json({ campaigns: rows.map((r) => campaignView(r, { owner: true })) });
});
