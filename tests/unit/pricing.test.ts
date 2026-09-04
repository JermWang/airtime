import { describe, it, expect } from "vitest";
import { computePrice } from "@/server/ads/pricing";
import type { PlacementPricingRules } from "@/server/db/schema";

const ETH = 10n ** 18n;

const fixed: PlacementPricingRules = { mode: "FIXED", unitSeconds: 900, durationExponentBps: 10_000, timeOfDay: [], premiumProgramMultiplierBps: 10_000, demand: { enabled: false, maxMultiplierBps: 10_000 }, proximity: [] };

const dynamic: PlacementPricingRules = {
  mode: "DYNAMIC",
  unitSeconds: 900,
  durationExponentBps: 10_000,
  timeOfDay: [{ fromHourUtc: 13, toHourUtc: 21, multiplierBps: 12_500 }],
  premiumProgramMultiplierBps: 15_000,
  demand: { enabled: true, maxMultiplierBps: 20_000 },
  proximity: [{ withinMinutes: 30, multiplierBps: 11_000 }],
};

const at = (h: number) => new Date(Date.UTC(2026, 8, 4, h, 0, 0));

describe("pricing", () => {
  it("prices a fixed placement linearly by duration", () => {
    const base = ETH / 500n; // 0.002 ETH per 15 min
    const r = computePrice({ placement: { basePriceWei: base.toString(), priceMultiplierBps: 10_000, pricingRules: fixed }, startsAt: at(10), endsAt: new Date(at(10).getTime() + 1800_000), now: at(9), occupancyRatio: 0.9, overlapsPremiumProgram: true });
    expect(r.amountWei).toBe(base * 2n);
    expect(r.breakdown.map((l) => l.label)).toEqual(["Base (900s)", "Duration 1800s"]);
  });

  it("applies placement multiplier in basis points", () => {
    const r = computePrice({ placement: { basePriceWei: (ETH / 100n).toString(), priceMultiplierBps: 15_000, pricingRules: fixed }, startsAt: at(10), endsAt: new Date(at(10).getTime() + 900_000), now: at(9), occupancyRatio: 0, overlapsPremiumProgram: false });
    expect(r.amountWei).toBe((ETH / 100n) * 15n / 10n);
  });

  it("stacks daypart, premium, demand and proximity multipliers when dynamic", () => {
    const base = ETH / 100n;
    const start = new Date(Date.UTC(2026, 8, 4, 15, 20, 0));
    const now = new Date(start.getTime() - 10 * 60_000);
    const r = computePrice({ placement: { basePriceWei: base.toString(), priceMultiplierBps: 10_000, pricingRules: dynamic }, startsAt: start, endsAt: new Date(start.getTime() + 900_000), now, occupancyRatio: 0.5, overlapsPremiumProgram: true });
    // base ×1.25 (daypart) ×1.5 (premium) ×1.5 (demand at 50%) ×1.1 (within 30m)
    let expected = base;
    expected = (expected * 12_500n) / 10_000n;
    expected = (expected * 15_000n) / 10_000n;
    expected = (expected * 15_000n) / 10_000n;
    expected = (expected * 11_000n) / 10_000n;
    expect(r.amountWei).toBe(expected);
    expect(r.breakdown.some((l) => l.label.startsWith("Daypart"))).toBe(true);
    expect(r.breakdown.some((l) => l.label === "Premium program")).toBe(true);
    expect(r.breakdown.some((l) => l.label.startsWith("Demand"))).toBe(true);
    expect(r.breakdown.some((l) => l.label.startsWith("Airs within"))).toBe(true);
  });

  it("does not apply dynamic multipliers outside their windows", () => {
    const base = ETH / 100n;
    const start = at(3);
    const r = computePrice({ placement: { basePriceWei: base.toString(), priceMultiplierBps: 10_000, pricingRules: { ...dynamic, timeOfDay: [] } }, startsAt: start, endsAt: new Date(start.getTime() + 900_000), now: new Date(start.getTime() - 3 * 3600_000), occupancyRatio: 0, overlapsPremiumProgram: false });
    expect(r.amountWei).toBe(base);
  });

  it("never returns zero", () => {
    const r = computePrice({ placement: { basePriceWei: "1", priceMultiplierBps: 1, pricingRules: fixed }, startsAt: at(10), endsAt: new Date(at(10).getTime() + 1000), now: at(9), occupancyRatio: 0, overlapsPremiumProgram: false });
    expect(r.amountWei).toBe(1n);
  });

  it("keeps arithmetic in bigint for very large amounts", () => {
    const huge = 10n ** 30n;
    const r = computePrice({ placement: { basePriceWei: huge.toString(), priceMultiplierBps: 10_000, pricingRules: fixed }, startsAt: at(10), endsAt: new Date(at(10).getTime() + 900_000), now: at(9), occupancyRatio: 0, overlapsPremiumProgram: false });
    expect(r.amountWei).toBe(huge);
  });
});
