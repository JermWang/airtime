import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/client";
import { sessionSecret } from "../env";

/**
 * Privacy-conscious first-party delivery analytics.
 *
 * Sessions are identified by a random id the browser keeps in memory for the
 * tab; the server stores only a salted hash that rotates daily, so nothing can
 * be joined back to a person or across days. These numbers describe delivery
 * as observed by the application and are never presented as on-chain facts.
 */

export type AnalyticsEventType = "present" | "visible" | "hidden" | "load_ok" | "load_fail" | "video_complete" | "click";

export const ANALYTICS_TYPES: AnalyticsEventType[] = ["present", "visible", "hidden", "load_ok", "load_fail", "video_complete", "click"];

export function hashSession(sessionId: string, at = new Date()): string {
  const day = at.toISOString().slice(0, 10);
  return createHash("sha256").update(`${sessionSecret()}:${day}:${sessionId}`).digest("hex").slice(0, 32);
}

export async function recordEvents(sessionId: string, events: Array<{ campaignId: string; placementId: string; type: AnalyticsEventType; value?: number | null }>): Promise<number> {
  if (!events.length) return 0;
  const campaignIds = [...new Set(events.map((e) => e.campaignId))];
  // Only campaigns currently on air accept events; anything else is dropped silently.
  const airing = await db()
    .select({ id: schema.campaigns.id, placementId: schema.campaigns.placementId })
    .from(schema.campaigns)
    .where(and(inArray(schema.campaigns.id, campaignIds), eq(schema.campaigns.status, "AIRING")));
  const allowed = new Map(airing.map((c) => [c.id, c.placementId]));
  const activations = await db()
    .select({ id: schema.adActivations.id, campaignId: schema.adActivations.campaignId })
    .from(schema.adActivations)
    .where(and(inArray(schema.adActivations.campaignId, [...allowed.keys()]), eq(schema.adActivations.status, "ACTIVE")));
  const activationByCampaign = new Map(activations.map((a) => [a.campaignId, a.id]));
  const sessionHash = hashSession(sessionId);
  const rows = events
    .filter((e) => allowed.get(e.campaignId) === e.placementId)
    .slice(0, 50)
    .map((e) => ({
      activationId: activationByCampaign.get(e.campaignId) ?? null,
      campaignId: e.campaignId,
      placementId: e.placementId,
      sessionHash,
      type: e.type,
      value: e.value ?? null,
    }));
  if (!rows.length) return 0;
  await db().insert(schema.analyticsEvents).values(rows);
  return rows.length;
}
