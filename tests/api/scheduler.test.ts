import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/server/chain/client", () => ({
  publicClient: () => ({ getBlockNumber: async () => 1n, getLogs: async () => [], getTransactionReceipt: async () => { throw new Error("none"); } }),
  paymentContractAddress: () => "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  requiredConfirmations: () => 1,
  serverRpcUrl: () => "mock",
  resetPublicClientForTests: () => {},
}));

import { boot } from "@/server/boot";
import { db, schema, closeDb } from "@/server/db/client";
import { tickOnce } from "@/server/worker/ticker";
import { setClockOffsetMs, serverNow, addSeconds } from "@/server/time/clock";
import { getCampaignDetail } from "@/server/ads/campaigns";
import { canRunInProcessTicker, isServerless } from "@/server/platform";

/**
 * On a serverless host nothing keeps a timer alive between requests, so the
 * whole scheduler has to be reachable as one idempotent function that cron can
 * call. These tests drive `tickOnce()` directly — exactly what /api/cron/tick
 * invokes — with the in-process ticker switched off.
 */

beforeAll(async () => {
  await boot({ ticker: false });
});

afterAll(async () => {
  setClockOffsetMs(0);
  await closeDb();
});

/**
 * A payment that was verified but whose run never started, e.g. the process died
 * between recording the payment and taking the surface. The tick has to finish
 * the job: the money is already on chain.
 */
async function strandedPaidCampaign(placementId = "SHOW") {
  const [placement] = await db().select().from(schema.placements).where(eq(schema.placements.id, placementId));
  const now = serverNow();
  const [campaign] = await db()
    .insert(schema.campaigns)
    .values({
      walletAddress: "0x00000000000000000000000000000000000000cc",
      channelId: placement.channelId,
      placementId: placement.id,
      displayName: "Cron driven",
      status: "PAID",
      paidPriceWei: placement.auction.openingPriceWei,
      guaranteedUntil: addSeconds(now, placement.auction.minHoldSeconds),
    })
    .returning();
  await db().insert(schema.reservations).values({
    placementId: placement.id,
    lane: placement.lane,
    campaignId: campaign.id,
    startsAt: now,
    endsAt: null,
    status: "CONFIRMED",
  });
  return { campaign, placement };
}

describe("scheduler driven by cron", () => {
  it("reports that a serverless host must not run the in-process ticker", () => {
    process.env.AIRTIME_FORCE_SERVERLESS = "true";
    expect(isServerless()).toBe(true);
    expect(canRunInProcessTicker()).toBe(false);
    delete process.env.AIRTIME_FORCE_SERVERLESS;
    expect(isServerless()).toBe(false);
  });

  it("finishes a payment whose run never started, and leaves it alone afterwards", async () => {
    const { campaign } = await strandedPaidCampaign();
    await tickOnce();
    const live = await getCampaignDetail(campaign.id);
    expect(live!.campaign.status).toBe("AIRING");
    expect(live!.campaign.startsAt).not.toBeNull();
    // A run has no scheduled end: it lasts until somebody pays more.
    expect(live!.campaign.endsAt).toBeNull();

    // Repeated ticks are idempotent; the run keeps going.
    await tickOnce();
    await tickOnce();
    expect((await getCampaignDetail(campaign.id))!.campaign.status).toBe("AIRING");

    // Even a long way into the future, nothing takes it off air on its own.
    setClockOffsetMs(7 * 86_400_000);
    await tickOnce();
    expect((await getCampaignDetail(campaign.id))!.campaign.status).toBe("AIRING");
    setClockOffsetMs(0);
  });

  it("ends a run that hits the operator's hard cap, with an AirLog", async () => {
    // Surfaces default to "runs until outbid"; a cap is opt-in per surface.
    await db().update(schema.placements).set({ auction: { ...(await placementRules("AD")), maxHoldSeconds: 3600 } }).where(eq(schema.placements.id, "AD"));
    const { campaign } = await strandedPaidCampaign("AD");
    await tickOnce();
    expect((await getCampaignDetail(campaign.id))!.campaign.status).toBe("AIRING");

    setClockOffsetMs(3700 * 1000);
    await tickOnce();
    const done = await getCampaignDetail(campaign.id);
    expect(done!.campaign.status).toBe("COMPLETED");
    expect(done!.campaign.endedReason).toBe("CAP_REACHED");
    expect(done!.airLog).not.toBeNull();
    setClockOffsetMs(0);
  });

  it("is safe to call concurrently, the way overlapping cron and request ticks can", async () => {
    await expect(Promise.all([tickOnce(), tickOnce(), tickOnce()])).resolves.toBeDefined();
  });
});

async function placementRules(id: string) {
  const [p] = await db().select().from(schema.placements).where(eq(schema.placements.id, id));
  return p.auction;
}
