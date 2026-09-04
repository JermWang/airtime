import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db, schema, type Db, type Tx } from "../db/client";
import { serverNow } from "../time/clock";
import { computeAsk } from "@/lib/auction";
import type { Campaign, Placement, Reservation } from "../db/schema";

/**
 * The airtime market.
 *
 * Nobody buys a thirty-second spot here. A buyer takes a surface at the price it
 * is asking right now and stays on it until somebody pays more. That makes the
 * price a single descending clock per surface:
 *
 *   • A surface nobody has ever bought asks `openingPriceWei` and walks down
 *     toward `floorPriceWei` over `decaySeconds`. That is the Dutch auction: the
 *     first buyer to think it is worth the current number takes it.
 *   • A sale resets the clock. The ask jumps to `takeoverPremiumBps` of what the
 *     buyer paid (2× by default) and starts descending again, but while the
 *     surface is occupied it can never fall below what the occupant paid plus
 *     `minIncrementBps`. A takeover is therefore always a strictly higher bid.
 *   • For the first `minHoldSeconds` of a run the surface is not for sale at all,
 *     so a buyer always gets the runtime they paid for before anyone can outbid.
 *   • When a run ends the clock resets again, this time descending from the last
 *     clearing price all the way to the floor, so an unwanted surface gets
 *     cheaper until somebody wants it.
 *
 * Every number here is bigint wei and every multiplier is integer basis points.
 * The descent is linear so it can be reproduced exactly by anyone reading the
 * placement row: ask = anchor − (anchor − floor) × elapsed ÷ decaySeconds.
 */

export { BPS, computeAsk, minIncrement, descentBounds, type Ask, type AskInput } from "@/lib/auction";

const big = (v: string | bigint): bigint => (typeof v === "bigint" ? v : BigInt(v || "0"));

/* -------------------------------------------------------------------------- */
/*  Surface state                                                             */
/* -------------------------------------------------------------------------- */

export type SurfaceStatus = "OPEN" | "PROTECTED" | "HELD" | "CLOSED";

export interface SurfaceOccupant {
  campaignId: string;
  displayName: string;
  wallet: string;
  pricePaidWei: string;
  since: string;
  guaranteedUntil: string | null;
  runtimeSec: number;
}

export interface SurfaceState {
  placementId: string;
  serverTime: number;
  status: SurfaceStatus;
  forSale: boolean;
  reason: string | null;
  askWei: string;
  anchorWei: string;
  floorWei: string;
  decaySeconds: number;
  secondsToFloor: number;
  askResetAt: string;
  lastClearingPriceWei: string;
  minHoldSeconds: number;
  maxHoldSeconds: number;
  occupant: SurfaceOccupant | null;
  /** Set while another buyer is completing a purchase: the ask is theirs until it lapses. */
  heldUntil: string | null;
}

function withinDailyWindow(placement: Placement, at: Date): boolean {
  const w = placement.availability.hoursUtc;
  if (!w) return true;
  const h = at.getUTCHours() + at.getUTCMinutes() / 60;
  return w.from <= w.to ? h >= w.from && h < w.to : h >= w.from || h < w.to;
}

/** The live occupancy of a lane, if any. */
export async function currentOccupant(placementId: string, executor: Db | Tx = db()): Promise<Campaign | null> {
  const [row] = await executor
    .select()
    .from(schema.campaigns)
    .where(and(eq(schema.campaigns.placementId, placementId), eq(schema.campaigns.status, "AIRING")));
  return row ?? null;
}

/** An unexpired quote hold on the lane. Only one buyer may be mid-purchase at a time. */
export async function activeHold(lane: string, now: Date, executor: Db | Tx = db(), ignoreCampaignId?: string): Promise<Reservation | null> {
  const rows = await executor
    .select()
    .from(schema.reservations)
    .where(and(eq(schema.reservations.lane, lane), eq(schema.reservations.status, "HELD"), or(isNull(schema.reservations.expiresAt), gt(schema.reservations.expiresAt, now))));
  const live = rows.filter((r) => !ignoreCampaignId || r.campaignId !== ignoreCampaignId);
  return live[0] ?? null;
}

export function describeSurface(placement: Placement, occupant: Campaign | null, hold: Reservation | null, now = serverNow()): SurfaceState {
  const ask = computeAsk({
    auction: placement.auction,
    lastClearingPriceWei: big(placement.lastClearingPriceWei),
    askResetAtMs: placement.askResetAt.getTime(),
    occupied: Boolean(occupant),
    nowMs: now.getTime(),
  });

  let status: SurfaceStatus = "OPEN";
  let reason: string | null = null;
  if (!placement.isActive) {
    status = "CLOSED";
    reason = "This surface is not selling right now";
  } else if (!withinDailyWindow(placement, now)) {
    status = "CLOSED";
    reason = "Outside this surface's daily window";
  } else if (hold) {
    status = "HELD";
    reason = "Another buyer is completing a purchase";
  } else if (ask.protectedForSec > 0) {
    status = "PROTECTED";
    reason = `Guaranteed runtime: cannot be taken for another ${ask.protectedForSec}s`;
  }

  return {
    placementId: placement.id,
    serverTime: now.getTime(),
    status,
    forSale: status === "OPEN",
    reason,
    askWei: ask.askWei.toString(),
    anchorWei: ask.anchorWei.toString(),
    floorWei: ask.floorWei.toString(),
    decaySeconds: ask.decaySeconds,
    secondsToFloor: ask.secondsToFloor,
    askResetAt: placement.askResetAt.toISOString(),
    lastClearingPriceWei: placement.lastClearingPriceWei,
    minHoldSeconds: placement.auction.minHoldSeconds,
    maxHoldSeconds: placement.auction.maxHoldSeconds,
    occupant: occupant
      ? {
          campaignId: occupant.id,
          displayName: occupant.displayName,
          wallet: occupant.walletAddress,
          pricePaidWei: occupant.paidPriceWei ?? "0",
          since: (occupant.startsAt ?? now).toISOString(),
          guaranteedUntil: occupant.guaranteedUntil?.toISOString() ?? null,
          runtimeSec: occupant.startsAt ? Math.max(0, Math.floor((now.getTime() - occupant.startsAt.getTime()) / 1000)) : 0,
        }
      : null,
    heldUntil: hold?.expiresAt?.toISOString() ?? null,
  };
}

/** Surface state for one placement, read straight from the database. */
export async function getSurfaceState(placement: Placement, executor: Db | Tx = db(), now = serverNow()): Promise<SurfaceState> {
  const occupant = await currentOccupant(placement.id, executor);
  const hold = await activeHold(placement.lane, now, executor);
  return describeSurface(placement, occupant, hold, now);
}

/**
 * How the price was arrived at, for the quote receipt. Every line is a fact about
 * the surface at the moment of quoting, not an invented multiplier.
 */
export function askBreakdown(placement: Placement, state: SurfaceState, now = serverNow()): Array<{ label: string; amountWei: string; multiplierBps?: number }> {
  const lines: Array<{ label: string; amountWei: string; multiplierBps?: number }> = [];
  const last = big(placement.lastClearingPriceWei);
  const elapsed = Math.max(0, Math.floor((now.getTime() - placement.askResetAt.getTime()) / 1000));

  if (last <= 0n) {
    lines.push({ label: "Opening ask", amountWei: state.anchorWei });
  } else if (state.occupant) {
    lines.push({ label: `Occupant paid (${state.occupant.displayName})`, amountWei: state.occupant.pricePaidWei });
    lines.push({ label: "Takeover premium", multiplierBps: placement.auction.takeoverPremiumBps, amountWei: state.anchorWei });
  } else {
    lines.push({ label: "Last clearing price", amountWei: state.anchorWei });
  }
  lines.push({ label: `Descending for ${elapsed}s of ${state.decaySeconds}s`, amountWei: state.askWei });
  if (state.askWei === state.floorWei) lines.push({ label: state.occupant ? "Minimum to outbid" : "Floor price", amountWei: state.floorWei });
  return lines;
}
