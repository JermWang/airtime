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
import { getTreasurySummary, recordTreasuryEntry, getTreasuryLedger, deleteTreasuryEntry } from "@/server/treasury/treasury";
import { setSetting } from "@/server/settings";

const ADMIN = { type: "ADMIN" as const, id: "test-admin" };
const ETH = 10n ** 18n;

beforeAll(async () => {
  await boot({ ticker: false });
  await db().delete(schema.treasuryEntries);
});

afterAll(async () => {
  await closeDb();
});

describe("treasury", () => {
  it("starts empty and earmarks nothing", async () => {
    const s = await getTreasurySummary();
    expect(s.airtimeRevenueWei).toBe("0");
    expect(s.totalInflowWei).toBe("0");
    expect(s.earmarkedWei).toBe("0");
    expect(s.sharesHeld).toBe("0");
    expect(s.allocationBps).toBe(10_000);
  });

  it("counts operator-recorded tax and earmarks it under the current policy", async () => {
    await recordTreasuryEntry({ kind: "TAX_INFLOW", occurredAt: new Date(), amountWei: (2n * ETH).toString(), note: "week 1 tax" }, ADMIN);
    let s = await getTreasurySummary();
    expect(s.taxInflowWei).toBe((2n * ETH).toString());
    expect(s.totalInflowWei).toBe((2n * ETH).toString());
    expect(s.earmarkedWei).toBe((2n * ETH).toString());
    expect(s.awaitingDeploymentWei).toBe((2n * ETH).toString());

    // Half the income earmarked → half the earmark.
    await setSetting("treasuryAllocationBps", 5_000);
    s = await getTreasurySummary();
    expect(s.earmarkedWei).toBe(ETH.toString());
    await setSetting("treasuryAllocationBps", 10_000);
  });

  it("tracks pre-stock bought, held and distributed", async () => {
    await recordTreasuryEntry({ kind: "STOCK_PURCHASE", occurredAt: new Date(), amountWei: (1n * ETH).toString(), shares: "12.5", reference: "broker-001" }, ADMIN);
    let s = await getTreasurySummary();
    expect(s.deployedWei).toBe(ETH.toString());
    expect(s.sharesAcquired).toBe("12.5");
    expect(s.sharesHeld).toBe("12.5");
    expect(s.awaitingDeploymentWei).toBe(ETH.toString());
    expect(s.purchases).toBe(1);

    await recordTreasuryEntry({ kind: "DISTRIBUTION", occurredAt: new Date(), shares: "4.25", holders: 130 }, ADMIN);
    s = await getTreasurySummary();
    expect(s.sharesDistributed).toBe("4.25");
    expect(s.sharesHeld).toBe("8.25");
    expect(s.holdersReached).toBe(130);
  });

  it("refuses to distribute more pre-stock than is recorded as held", async () => {
    await expect(recordTreasuryEntry({ kind: "DISTRIBUTION", occurredAt: new Date(), shares: "1000" }, ADMIN)).rejects.toMatchObject({ status: 409 });
  });

  it("requires the figures that make an entry meaningful", async () => {
    await expect(recordTreasuryEntry({ kind: "STOCK_PURCHASE", occurredAt: new Date(), amountWei: ETH.toString() }, ADMIN)).rejects.toMatchObject({ status: 400 });
    await expect(recordTreasuryEntry({ kind: "TAX_INFLOW", occurredAt: new Date() }, ADMIN)).rejects.toMatchObject({ status: 400 });
  });

  it("counts verified airtime payments as revenue without anyone entering them", async () => {
    const [campaign] = await db()
      .select()
      .from(schema.campaigns)
      .limit(1);
    // Insert a confirmed payment directly; this mirrors what the payment verifier writes.
    const [placement] = await db().select().from(schema.placements).where(eq(schema.placements.id, "STUDIO_LEFT"));
    const [created] = campaign
      ? [campaign]
      : await db()
          .insert(schema.campaigns)
          .values({ walletAddress: "0x00000000000000000000000000000000000000aa", channelId: placement.channelId, placementId: placement.id, displayName: "Revenue test" })
          .returning();
    await db().insert(schema.payments).values({
      campaignId: created.id,
      quoteId: `0x${"ab".repeat(32)}`,
      chainId: 31337,
      txHash: `0x${"cd".repeat(32)}`,
      blockNumber: 10n,
      logIndex: 0,
      buyer: created.walletAddress,
      paymentToken: "0x0000000000000000000000000000000000000000",
      amountWei: (3n * ETH).toString(),
      status: "CONFIRMED",
    });

    const s = await getTreasurySummary();
    expect(s.airtimeRevenueWei).toBe((3n * ETH).toString());
    expect(s.airtimePayments).toBe(1);
    // 3 ETH revenue + 2 ETH tax, all earmarked, 1 ETH already spent.
    expect(s.totalInflowWei).toBe((5n * ETH).toString());
    expect(s.awaitingDeploymentWei).toBe((4n * ETH).toString());
  });

  it("keeps a deletable ledger", async () => {
    const ledger = await getTreasuryLedger();
    expect(ledger.length).toBeGreaterThanOrEqual(3);
    expect(ledger[0].kind).toBeDefined();
    const target = ledger.find((r) => r.kind === "TAX_INFLOW")!;
    await deleteTreasuryEntry(target.id, ADMIN);
    const after = await getTreasurySummary();
    expect(after.taxInflowWei).toBe("0");
    await expect(deleteTreasuryEntry(target.id, ADMIN)).rejects.toMatchObject({ status: 404 });
  });
});
