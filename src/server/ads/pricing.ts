import type { Placement, PriceBreakdownLine } from "../db/schema";

/**
 * Data-driven pricing. All arithmetic is bigint in wei with multipliers in basis
 * points (10000 = 1.0×) so no floating point ever touches a monetary value.
 *
 *   price = base
 *         × placement multiplier
 *         × duration multiplier   (duration / unit)^exponent
 *         × time-of-day multiplier
 *         × premium program multiplier
 *         × demand multiplier     1 + (max − 1) · occupancy
 *         × proximity multiplier  (how close to air the slot is)
 */

export const BPS = 10_000n;

export interface PricingContext {
  placement: Pick<Placement, "basePriceWei" | "priceMultiplierBps" | "pricingRules">;
  startsAt: Date;
  endsAt: Date;
  now: Date;
  /** 0..1 – share of the surrounding day already sold on this lane. */
  occupancyRatio: number;
  overlapsPremiumProgram: boolean;
}

export interface PriceResult {
  amountWei: bigint;
  breakdown: PriceBreakdownLine[];
}

function mul(amount: bigint, bps: bigint): bigint {
  return (amount * bps) / BPS;
}

/** Integer power with fractional exponent approximated in bps (used for sub/super-linear duration curves). */
function durationMultiplierBps(durationSec: number, unitSeconds: number, exponentBps: number): bigint {
  const ratio = durationSec / Math.max(1, unitSeconds);
  const exponent = exponentBps / 10_000;
  // The only place a float is used: computing a dimensionless multiplier that is
  // immediately rounded to basis points. Monetary amounts stay bigint.
  const m = Math.pow(ratio, exponent);
  return BigInt(Math.max(1, Math.round(m * 10_000)));
}

export function computePrice(ctx: PricingContext): PriceResult {
  const rules = ctx.placement.pricingRules;
  const durationSec = Math.round((ctx.endsAt.getTime() - ctx.startsAt.getTime()) / 1000);
  const breakdown: PriceBreakdownLine[] = [];

  let amount = BigInt(ctx.placement.basePriceWei);
  breakdown.push({ label: `Base (${rules.unitSeconds}s)`, amountWei: amount.toString() });

  const placementBps = BigInt(ctx.placement.priceMultiplierBps || 10_000);
  if (placementBps !== BPS) {
    amount = mul(amount, placementBps);
    breakdown.push({ label: "Placement", multiplierBps: Number(placementBps), amountWei: amount.toString() });
  }

  const durBps = durationMultiplierBps(durationSec, rules.unitSeconds, rules.durationExponentBps || 10_000);
  amount = mul(amount, durBps);
  breakdown.push({ label: `Duration ${durationSec}s`, multiplierBps: Number(durBps), amountWei: amount.toString() });

  if (rules.mode === "DYNAMIC") {
    const hour = ctx.startsAt.getUTCHours();
    const tod = rules.timeOfDay.find((w) => (w.fromHourUtc <= w.toHourUtc ? hour >= w.fromHourUtc && hour < w.toHourUtc : hour >= w.fromHourUtc || hour < w.toHourUtc));
    if (tod && tod.multiplierBps !== 10_000) {
      amount = mul(amount, BigInt(tod.multiplierBps));
      breakdown.push({ label: `Daypart ${String(tod.fromHourUtc).padStart(2, "0")}–${String(tod.toHourUtc).padStart(2, "0")} UTC`, multiplierBps: tod.multiplierBps, amountWei: amount.toString() });
    }

    if (ctx.overlapsPremiumProgram && rules.premiumProgramMultiplierBps && rules.premiumProgramMultiplierBps !== 10_000) {
      amount = mul(amount, BigInt(rules.premiumProgramMultiplierBps));
      breakdown.push({ label: "Premium program", multiplierBps: rules.premiumProgramMultiplierBps, amountWei: amount.toString() });
    }

    if (rules.demand?.enabled) {
      const occupancy = Math.min(1, Math.max(0, ctx.occupancyRatio));
      const extra = Math.round((rules.demand.maxMultiplierBps - 10_000) * occupancy);
      const demandBps = 10_000 + extra;
      if (demandBps !== 10_000) {
        amount = mul(amount, BigInt(demandBps));
        breakdown.push({ label: `Demand ${(occupancy * 100).toFixed(0)}% booked`, multiplierBps: demandBps, amountWei: amount.toString() });
      }
    }

    const minutesUntil = (ctx.startsAt.getTime() - ctx.now.getTime()) / 60_000;
    const prox = [...(rules.proximity ?? [])].sort((a, b) => a.withinMinutes - b.withinMinutes).find((p) => minutesUntil <= p.withinMinutes);
    if (prox && prox.multiplierBps !== 10_000) {
      amount = mul(amount, BigInt(prox.multiplierBps));
      breakdown.push({ label: `Airs within ${prox.withinMinutes}m`, multiplierBps: prox.multiplierBps, amountWei: amount.toString() });
    }
  }

  if (amount <= 0n) amount = 1n;
  return { amountWei: amount, breakdown };
}
