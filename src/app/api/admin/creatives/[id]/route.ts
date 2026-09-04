import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { route, type Params } from "@/server/route";
import { json, parseBody, assertSameOrigin, notFound } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { audit } from "@/server/audit";
import { publish } from "@/server/realtime/bus";
import { publicCreative } from "@/server/ads/creatives";

export const dynamic = "force-dynamic";

const body = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().max(500).optional() });

/** Moderation decision. Rejecting also rejects any unpaid campaigns using the creative. */
export const PATCH = route<Params<{ id: string }>>(async (req, { params }) => {
  assertSameOrigin(req);
  const { id } = await params;
  const admin = await requireAdmin(["OWNER", "OPERATOR", "MODERATOR"]);
  const { decision, note } = await parseBody(req, body);
  const [row] = await db().update(schema.creatives).set({ status: decision, moderationNote: note ?? null }).where(eq(schema.creatives.id, id)).returning();
  if (!row) notFound();
  const affected = await db()
    .select()
    .from(schema.campaigns)
    .where(and(eq(schema.campaigns.creativeId, id), inArray(schema.campaigns.status, ["DRAFT", "VALIDATING", "READY_TO_PURCHASE"])));
  for (const c of affected) {
    await db()
      .update(schema.campaigns)
      .set({ status: decision === "APPROVED" ? "READY_TO_PURCHASE" : "REJECTED", rejectionReason: decision === "REJECTED" ? note ?? "Creative rejected by moderation" : null, updatedAt: new Date() })
      .where(eq(schema.campaigns.id, c.id));
    publish({ type: "campaign.updated", campaignId: c.id, status: decision === "APPROVED" ? "READY_TO_PURCHASE" : "REJECTED", placementId: c.placementId });
  }
  await audit({ type: "ADMIN", id: admin.adminId }, `creative.${decision.toLowerCase()}`, { type: "creative", id }, { note: note ?? null, affectedCampaigns: affected.map((c) => c.id) });
  return json({ creative: publicCreative(row) });
});
