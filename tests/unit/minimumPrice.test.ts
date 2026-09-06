import { describe, it, expect } from "vitest";
import { auctionSchema } from "@/server/admin/schemas";
import { MIN_PRICE_WEI } from "@/lib/auction";
import { BASE_PLACEMENTS } from "@/server/db/seed";

const base = { decaySeconds: 3600, takeoverPremiumBps: 20_000, minIncrementBps: 500, minHoldSeconds: 600, maxHoldSeconds: 0 };

describe("the control room cannot list a surface below the minimum", () => {
  it("takes rules that start at the minimum", () => {
    const parsed = auctionSchema.parse({ ...base, openingPriceWei: MIN_PRICE_WEI.toString(), floorPriceWei: MIN_PRICE_WEI.toString() });
    expect(parsed.openingPriceWei).toBe("10000000000000000");
  });

  it("refuses an opening price under it", () => {
    const cheap = { ...base, openingPriceWei: (MIN_PRICE_WEI - 1n).toString(), floorPriceWei: MIN_PRICE_WEI.toString() };
    expect(auctionSchema.safeParse(cheap).success).toBe(false);
  });

  it("refuses a floor under it", () => {
    const cheap = { ...base, openingPriceWei: MIN_PRICE_WEI.toString(), floorPriceWei: "100000000000000" };
    const result = auctionSchema.safeParse(cheap);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toContain("0.01 ETH");
  });

  it("still takes anything above it", () => {
    expect(auctionSchema.safeParse({ ...base, openingPriceWei: "6000000000000000000", floorPriceWei: "600000000000000000" }).success).toBe(true);
  });
});

describe("the seeded surfaces", () => {
  it("all open at the minimum and floor there", () => {
    expect(BASE_PLACEMENTS).toHaveLength(4);
    for (const p of BASE_PLACEMENTS) {
      expect(BigInt(p.auction.openingPriceWei), p.id).toBe(MIN_PRICE_WEI);
      expect(BigInt(p.auction.floorPriceWei), p.id).toBe(MIN_PRICE_WEI);
    }
  });
});
