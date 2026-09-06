/**
 * The price curve, shared by the server and the browser.
 *
 * The server is the only authority on what a surface costs — it signs the quote —
 * but the browser has to draw the same descending number between polls or the
 * price would visibly jump. Both sides therefore run this one function.
 *
 *   ask(t) = anchor − (anchor − floor) × elapsed ÷ decaySeconds
 *
 * All bigint wei, all integer basis points, no floats anywhere near a price.
 */

export const BPS = 10_000n;

/**
 * The floor under every surface on the station: 0.01 ETH.
 *
 * Nothing is ever asked for less than this, whatever a placement's stored rules
 * say. Configuration is validated against it and the seed opens there, but the
 * clamp lives here as well because this is the one function both the server and
 * the browser derive a price from: a row written before the rule existed, or by
 * hand, still cannot put a surface on sale below the station's minimum.
 */
export const MIN_PRICE_WEI = 10_000_000_000_000_000n;

export interface AuctionRules {
  openingPriceWei: string;
  floorPriceWei: string;
  decaySeconds: number;
  takeoverPremiumBps: number;
  minIncrementBps: number;
  minHoldSeconds: number;
  maxHoldSeconds: number;
}

const maxBig = (a: bigint, b: bigint): bigint => (a > b ? a : b);

/** The smallest amount by which a challenger has to beat the occupant. */
export function minIncrement(priceWei: bigint, minIncrementBps: number): bigint {
  const step = (priceWei * BigInt(Math.max(0, minIncrementBps))) / BPS;
  return step > 0n ? step : 1n;
}

export interface AskInput {
  auction: AuctionRules;
  /** What the most recent buyer paid; 0 when the surface has never been sold. */
  lastClearingPriceWei: bigint;
  /** When the current descent began: a sale, or the end of a run. */
  askResetAtMs: number;
  occupied: boolean;
  nowMs: number;
}

export interface Ask {
  askWei: bigint;
  /** Top of the current descent. */
  anchorWei: bigint;
  /** Bottom of the current descent. */
  floorWei: bigint;
  decaySeconds: number;
  elapsedSec: number;
  /** Seconds until the ask reaches its floor, including any protected runtime. */
  secondsToFloor: number;
  /** Guaranteed runtime the occupant has left. The surface cannot be taken until it is 0. */
  protectedForSec: number;
}

/**
 * The two ends of the current descent.
 *
 *  never sold  – opening price          → floor price
 *  occupied    – premium × price paid   → price paid + minimum increment
 *  free again  – last clearing price    → floor price
 */
export function descentBounds(rules: AuctionRules, lastClearingPriceWei: bigint, occupied: boolean): { anchorWei: bigint; floorWei: bigint } {
  // The station minimum applies to the bottom of every descent, so no path
  // through this function can put a surface on sale below it.
  const bounds = (floor: bigint, anchor: bigint) => {
    const floorWei = maxBig(floor, MIN_PRICE_WEI);
    return { floorWei, anchorWei: maxBig(anchor, floorWei) };
  };

  const configFloor = BigInt(rules.floorPriceWei || "0");
  if (lastClearingPriceWei <= 0n) {
    return bounds(configFloor, BigInt(rules.openingPriceWei || "0"));
  }
  if (occupied) {
    const floorWei = lastClearingPriceWei + minIncrement(lastClearingPriceWei, rules.minIncrementBps);
    const premium = (lastClearingPriceWei * BigInt(Math.max(10_000, rules.takeoverPremiumBps))) / BPS;
    return bounds(floorWei, premium);
  }
  return bounds(configFloor, lastClearingPriceWei);
}

/** The ask at a moment in time. Pure: same inputs, same number, on both sides. */
export function computeAsk(input: AskInput): Ask {
  const rules = input.auction;
  const { anchorWei, floorWei } = descentBounds(rules, input.lastClearingPriceWei, input.occupied);

  const decaySeconds = Math.max(1, Math.floor(rules.decaySeconds));
  const elapsedSec = Math.max(0, Math.floor((input.nowMs - input.askResetAtMs) / 1000));
  const holdSec = input.occupied ? Math.max(0, Math.floor(rules.minHoldSeconds)) : 0;
  const protectedForSec = Math.max(0, holdSec - elapsedSec);
  // The descent only starts once the occupant's guaranteed runtime is over.
  const descending = Math.min(Math.max(0, elapsedSec - holdSec), decaySeconds);
  const askWei = anchorWei - ((anchorWei - floorWei) * BigInt(descending)) / BigInt(decaySeconds);

  return {
    askWei: maxBig(askWei, floorWei),
    anchorWei,
    floorWei,
    decaySeconds,
    elapsedSec,
    secondsToFloor: Math.max(0, decaySeconds - descending) + protectedForSec,
    protectedForSec,
  };
}

/** How far through the current descent the price is, 0–1, for progress bars. */
export function descentProgress(ask: Pick<Ask, "askWei" | "anchorWei" | "floorWei">): number {
  const span = ask.anchorWei - ask.floorWei;
  if (span <= 0n) return 1;
  const fallen = ask.anchorWei - ask.askWei;
  return Math.min(1, Math.max(0, Number((fallen * 1000n) / span) / 1000));
}
