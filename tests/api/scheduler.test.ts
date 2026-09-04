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

async function paidCampaignDueNow() {
  const [placement] = await db().select().from(schema.placements).where(eq(schema.placements.id, "STUDIO_RIGHT"));
  const startsAt = addSeconds(serverNow(), 60);
  const endsAt = addSeconds(startsAt, 300);
  const [campaign] = await db()
    .insert(schema.campaigns)
    .values({
      walletAddress: "0x00000000000000000000000000000000000000cc",
      channelId: placement.channelId,
      placementId: placement.id,
      displayName: "Cron driven",
      status: "QUEUED",
      startsAt,
      endsAt,
      durationSec: 300,
    })
    .returning();
  await db().insert(schema.reservations).values({
    placementId: placement.id,
    lane: placement.lane,
    campaignId: campaign.id,
    startsAt,
    endsAt,
    status: "CONFIRMED",
  });
  await db().insert(schema.adActivations).values({
    campaignId: campaign.id,
    placementId: placement.id,
    channelId: placement.channelId,
    scheduledStart: startsAt,
    scheduledEnd: endsAt,
    status: "SCHEDULED",
  });
  return { campaign, startsAt, endsAt };
}

describe("scheduler driven by cron", () => {
  it("reports that a serverless host must not run the in-process ticker", () => {
    process.env.AIRTIME_FORCE_SERVERLESS = "true";
    expect(isServerless()).toBe(true);
    expect(canRunInProcessTicker()).toBe(false);
    delete process.env.AIRTIME_FORCE_SERVERLESS;
    expect(isServerless()).toBe(false);
  });

  it("takes a queued campaign on and off air across separate tick calls", async () => {
    const { campaign, startsAt, endsAt } = await paidCampaignDueNow();
    expect((await getCampaignDetail(campaign.id))!.campaign.status).toBe("QUEUED");

    // Nothing is due yet: a tick must not change anything.
    await tickOnce();
    expect((await getCampaignDetail(campaign.id))!.campaign.status).toBe("QUEUED");

    // The reserved window arrives; the next cron call puts it on air.
    setClockOffsetMs(startsAt.getTime() - Date.now() + 1000);
    await tickOnce();
    expect((await getCampaignDetail(campaign.id))!.campaign.status).toBe("AIRING");

    // Calling again inside the window is harmless.
    await tickOnce();
    expect((await getCampaignDetail(campaign.id))!.campaign.status).toBe("AIRING");

    // Past the window it completes and the AirLog exists.
    setClockOffsetMs(endsAt.getTime() - Date.now() + 1000);
    await tickOnce();
    const done = await getCampaignDetail(campaign.id);
    expect(done!.campaign.status).toBe("COMPLETED");
    expect(done!.airLog).not.toBeNull();
    setClockOffsetMs(0);
  });

  it("is safe to call concurrently, the way overlapping cron and request ticks can", async () => {
    await expect(Promise.all([tickOnce(), tickOnce(), tickOnce()])).resolves.toBeDefined();
  });
});
