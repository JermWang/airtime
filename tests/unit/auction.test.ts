import { describe, it, expect } from "vitest";
import { computeAsk, descentBounds, descentProgress, minIncrement, MIN_PRICE_WEI, type AuctionRules } from "@/lib/auction";

const eth = (n: number) => (10n ** 18n * BigInt(Math.round(n * 1000))) / 1000n;

const rules: AuctionRules = {
  openingPriceWei: eth(1).toString(),
  floorPriceWei: eth(0.1).toString(),
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
    expect(at(0).askWei).toBe(eth(1));
    expect(at(1800).askWei).toBe(eth(0.55)); // halfway: 1 − (1 − 0.1)/2
    expect(at(3600).askWei).toBe(eth(0.1));
  });

  it("never falls below the floor, however long it sits there", () => {
    expect(at(3600 * 50).askWei).toBe(eth(0.1));
    expect(at(3600 * 50).secondsToFloor).toBe(0);
  });

  it("jumps to the takeover premium when the surface is occupied", () => {
    const paid = eth(0.4);
    const ask = at(0, { lastClearingPriceWei: paid, occupied: true });
    expect(ask.anchorWei).toBe(eth(0.8));
    expect(ask.askWei).toBe(eth(0.8));
  });

  it("holds the ask flat while the occupant's guaranteed runtime runs", () => {
    const paid = eth(0.4);
    expect(at(0, { lastClearingPriceWei: paid, occupied: true }).askWei).toBe(eth(0.8));
    expect(at(599, { lastClearingPriceWei: paid, occupied: true }).askWei).toBe(eth(0.8));
    expect(at(599, { lastClearingPriceWei: paid, occupied: true }).protectedForSec).toBe(1);
    // The descent starts only once the guarantee is over.
    expect(at(600, { lastClearingPriceWei: paid, occupied: true }).protectedForSec).toBe(0);
    expect(at(600 + 1800, { lastClearingPriceWei: paid, occupied: true }).askWei).toBeLessThan(eth(0.8));
  });

  it("never lets a challenger take an occupied surface for less than the occupant paid", () => {
    const paid = eth(0.4);
    const floor = paid + minIncrement(paid, rules.minIncrementBps);
    const late = at(600 + 3600 * 10, { lastClearingPriceWei: paid, occupied: true });
    expect(late.askWei).toBe(floor);
    expect(late.askWei).toBeGreaterThan(paid);
    expect(floor).toBe(eth(0.42)); // +5%
  });

  it("descends from the last clearing price back to the floor once the surface is free", () => {
    const paid = eth(0.4);
    expect(at(0, { lastClearingPriceWei: paid, occupied: false }).askWei).toBe(paid);
    expect(at(3600, { lastClearingPriceWei: paid, occupied: false }).askWei).toBe(eth(0.1));
  });

  it("keeps a cheap sale from dragging the ask under the configured floor", () => {
    const paid = eth(0.05); // below the floor: only possible if an operator lowers it later
    const free = descentBounds(rules, paid, false);
    expect(free.anchorWei).toBe(eth(0.1));
    expect(free.floorWei).toBe(eth(0.1));
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

  it("uses whole wei only: no floats reach a price", () => {
    const odd: AuctionRules = { ...rules, openingPriceWei: "1000000000000000007", floorPriceWei: "3", decaySeconds: 7 };
    for (let t = 0; t <= 7; t++) {
      const ask = computeAsk({ auction: odd, lastClearingPriceWei: 0n, askResetAtMs: T0, occupied: false, nowMs: T0 + t * 1000 });
      expect(typeof ask.askWei).toBe("bigint");
      expect(ask.askWei).toBeGreaterThanOrEqual(3n);
    }
  });

  it("gives a minimum increment of at least one wei", () => {
    expect(minIncrement(1n, 500)).toBe(1n);
    expect(minIncrement(0n, 500)).toBe(1n);
    expect(minIncrement(eth(1), 500)).toBe(eth(0.05));
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
  const cheap: AuctionRules = { ...rules, openingPriceWei: eth(0.002).toString(), floorPriceWei: eth(0.001).toString() };

  it("is the floor of a surface that has never been sold", () => {
    const bounds = descentBounds(cheap, 0n, false);
    expect(bounds.floorWei).toBe(MIN_PRICE_WEI);
    expect(bounds.anchorWei).toBe(MIN_PRICE_WEI);
    for (const t of [0, 60, 1800, 3600, 3600 * 24]) {
      expect(at(t, { auction: cheap }).askWei).toBe(MIN_PRICE_WEI);
    }
  });

  it("is the floor of a surface whose occupant paid less than it", () => {
    const paid = eth(0.0001); // what the panels in the seeded DB had been sold for
    const held = descentBounds(cheap, paid, true);
    expect(held.floorWei).toBe(MIN_PRICE_WEI);
    // A takeover still costs the minimum rather than the occupant's price + 5%.
    expect(held.floorWei).toBeGreaterThan(paid + minIncrement(paid, cheap.minIncrementBps));
    expect(at(3600 * 9, { auction: cheap, lastClearingPriceWei: paid, occupied: true }).askWei).toBe(MIN_PRICE_WEI);
  });

  it("is the floor of a surface that has come free again", () => {
    expect(descentBounds(cheap, eth(0.0005), false).floorWei).toBe(MIN_PRICE_WEI);
    expect(at(3600 * 9, { auction: cheap, lastClearingPriceWei: eth(0.0005) }).askWei).toBe(MIN_PRICE_WEI);
  });

  it("never lowers a price that is already above it", () => {
    expect(at(0).askWei).toBe(eth(1));
    expect(at(3600).askWei).toBe(eth(0.1));
    const paid = eth(0.4);
    expect(descentBounds(rules, paid, true).floorWei).toBe(eth(0.42));
  });

  it("holds for every state the curve can be in", () => {
    for (const auction of [rules, cheap, { ...rules, openingPriceWei: "0", floorPriceWei: "0" }]) {
      for (const paid of [0n, 1n, eth(0.0001), eth(0.01), eth(3)]) {
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
