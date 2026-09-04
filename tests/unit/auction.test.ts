import { describe, it, expect } from "vitest";
import { computeAsk, descentBounds, descentProgress, minIncrement, type AuctionRules } from "@/lib/auction";

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
