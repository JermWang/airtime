import { describe, it, expect } from "vitest";
import { computeAsk, descentBounds, descentProgress, minIncrement, MIN_PRICE_WEI, type AuctionRules } from "@/lib/auction";

const sol = (n: number) => (10n ** 9n * BigInt(Math.round(n * 1000))) / 1000n;

const rules: AuctionRules = {
  openingPriceWei: sol(1).toString(),
  floorPriceWei: sol(0.5).toString(),
  decaySeconds: 3600,
  takeoverPremiumBps: 20_000,
  minIncrementBps: 500,
  minHoldSeconds: 600,
  maxHoldSeconds: 0,
};

const T0 = 1_700_000_000_000;
const at = (sec: number, over: Partial<{ lastClearingPriceWei: bigint; occupied: boolean; auction: AuctionRules }> = {}) =>
  computeAsk({
    auction: over.auction ?? rules,
    lastClearingPriceWei: over.lastClearingPriceWei ?? 0n,
    askResetAtMs: T0,
    occupied: over.occupied ?? false,
    nowMs: T0 + sec * 1000,
  });

describe("the descending ask", () => {
  it("opens at the opening price and walks linearly to the floor", () => {
    expect(at(0).askWei).toBe(sol(1));
    expect(at(1800).askWei).toBe(sol(0.75)); // halfway: 1 − (1 − 0.5)/2
    expect(at(3600).askWei).toBe(sol(0.5));
  });

  it("never falls below the floor, however long it sits there", () => {
    expect(at(3600 * 50).askWei).toBe(sol(0.5));
    expect(at(3600 * 50).secondsToFloor).toBe(0);
  });

  it("jumps to the takeover premium when the surface is occupied", () => {
    const paid = sol(0.6);
    const ask = at(0, { lastClearingPriceWei: paid, occupied: true });
    expect(ask.anchorWei).toBe(sol(1.2));
    expect(ask.askWei).toBe(sol(1.2));
  });

  it("holds the ask flat while the occupant's guaranteed runtime runs", () => {
    const paid = sol(0.6);
    expect(at(0, { lastClearingPriceWei: paid, occupied: true }).askWei).toBe(sol(1.2));
    expect(at(599, { lastClearingPriceWei: paid, occupied: true }).askWei).toBe(sol(1.2));
    expect(at(599, { lastClearingPriceWei: paid, occupied: true }).protectedForSec).toBe(1);
    // The descent starts only once the guarantee is over.
    expect(at(600, { lastClearingPriceWei: paid, occupied: true }).protectedForSec).toBe(0);
    expect(at(600 + 1800, { lastClearingPriceWei: paid, occupied: true }).askWei).toBeLessThan(sol(1.2));
  });

  it("never lets a challenger take an occupied surface for less than the occupant paid", () => {
    const paid = sol(0.6);
    const floor = paid + minIncrement(paid, rules.minIncrementBps);
    const late = at(600 + 3600 * 10, { lastClearingPriceWei: paid, occupied: true });
    expect(late.askWei).toBe(floor);
    expect(late.askWei).toBeGreaterThan(paid);
    expect(floor).toBe(sol(0.63)); // +5%
  });

  it("descends from the last clearing price back to the floor once the surface is free", () => {
    const paid = sol(0.6);
    expect(at(0, { lastClearingPriceWei: paid, occupied: false }).askWei).toBe(paid);
    expect(at(3600, { lastClearingPriceWei: paid, occupied: false }).askWei).toBe(sol(0.5));
  });

  it("keeps a cheap sale from dragging the ask under the configured floor", () => {
    const paid = sol(0.05); // below the floor: only possible if an operator lowers it later
    const free = descentBounds(rules, paid, false);
    expect(free.anchorWei).toBe(sol(0.5));
    expect(free.floorWei).toBe(sol(0.5));
  });

  it("is monotonically non-increasing across a descent", () => {
    let previous = at(0).askWei;
    for (let t = 0; t <= 3600; t += 137) {
      const ask = at(t).askWei;
      expect(ask).toBeLessThanOrEqual(previous);
      previous = ask;
    }
  });

  it("reports progress through the descent for the price bar", () => {
    expect(descentProgress(at(0))).toBeCloseTo(0, 2);
    expect(descentProgress(at(1800))).toBeCloseTo(0.5, 2);
    expect(descentProgress(at(3600))).toBeCloseTo(1, 2);
  });

  it("uses whole lamports only: no floats reach a price", () => {
    const odd: AuctionRules = { ...rules, openingPriceWei: "1000000000000000007", floorPriceWei: "3", decaySeconds: 7 };
    for (let t = 0; t <= 7; t++) {
      const ask = computeAsk({ auction: odd, lastClearingPriceWei: 0n, askResetAtMs: T0, occupied: false, nowMs: T0 + t * 1000 });
      expect(typeof ask.askWei).toBe("bigint");
      expect(ask.askWei).toBeGreaterThanOrEqual(3n);
    }
  });

  it("gives a minimum increment of at least one lamports", () => {
    expect(minIncrement(1n, 500)).toBe(1n);
    expect(minIncrement(0n, 500)).toBe(1n);
    expect(minIncrement(sol(1), 500)).toBe(sol(0.05));
  });
});

describe("holder reward cap", () => {
  it("renders parts per million as an exact percentage", async () => {
    const { formatPercentFromPpm } = await import("@/lib/format");
    expect(formatPercentFromPpm(50)).toBe("0.005"); // the cap the station advertises
    expect(formatPercentFromPpm(10_000)).toBe("1");
    expect(formatPercentFromPpm(12_500)).toBe("1.25");
    expect(formatPercentFromPpm(1)).toBe("0.0001");
    expect(formatPercentFromPpm(0)).toBe("0");
  });
});

describe("the station minimum", () => {
  // Rules written before the minimum existed, or by hand: a tenth of it.
  const cheap: AuctionRules = { ...rules, openingPriceWei: sol(0.002).toString(), floorPriceWei: sol(0.001).toString() };

  it("is the floor of a surface that has never been sold", () => {
    const bounds = descentBounds(cheap, 0n, false);
    expect(bounds.floorWei).toBe(MIN_PRICE_WEI);
    expect(bounds.anchorWei).toBe(MIN_PRICE_WEI);
    for (const t of [0, 60, 1800, 3600, 3600 * 24]) {
      expect(at(t, { auction: cheap }).askWei).toBe(MIN_PRICE_WEI);
    }
  });

  it("is the floor of a surface whose occupant paid less than it", () => {
    const paid = sol(0.0001); // what the panels in the seeded DB had been sold for
    const held = descentBounds(cheap, paid, true);
    expect(held.floorWei).toBe(MIN_PRICE_WEI);
    // A takeover still costs the minimum rather than the occupant's price + 5%.
    expect(held.floorWei).toBeGreaterThan(paid + minIncrement(paid, cheap.minIncrementBps));
    expect(at(3600 * 9, { auction: cheap, lastClearingPriceWei: paid, occupied: true }).askWei).toBe(MIN_PRICE_WEI);
  });

  it("is the floor of a surface that has come free again", () => {
    expect(descentBounds(cheap, sol(0.0005), false).floorWei).toBe(MIN_PRICE_WEI);
    expect(at(3600 * 9, { auction: cheap, lastClearingPriceWei: sol(0.0005) }).askWei).toBe(MIN_PRICE_WEI);
  });

  it("never lowers a price that is already above it", () => {
    expect(at(0).askWei).toBe(sol(1));
    expect(at(3600).askWei).toBe(sol(0.5));
    const paid = sol(0.6);
    expect(descentBounds(rules, paid, true).floorWei).toBe(sol(0.63));
  });

  it("holds for every state the curve can be in", () => {
    for (const auction of [rules, cheap, { ...rules, openingPriceWei: "0", floorPriceWei: "0" }]) {
      for (const paid of [0n, 1n, sol(0.0001), sol(0.01), sol(3)]) {
        for (const occupied of [true, false]) {
          for (const t of [0, 1, 599, 600, 3599, 3600, 100_000]) {
            const ask = computeAsk({ auction, lastClearingPriceWei: paid, askResetAtMs: T0, occupied, nowMs: T0 + t * 1000 });
            expect(ask.askWei).toBeGreaterThanOrEqual(MIN_PRICE_WEI);
            expect(ask.floorWei).toBeGreaterThanOrEqual(MIN_PRICE_WEI);
            expect(ask.anchorWei).toBeGreaterThanOrEqual(ask.floorWei);
          }
        }
      }
    }
  });
});
