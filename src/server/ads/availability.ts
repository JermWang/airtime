import { and, eq, gt, lt, or, inArray, isNull } from "drizzle-orm";
import { db, schema, type Db, type Tx } from "../db/client";
import { blocksInRange } from "../broadcast/schedule";
import { serverNow, addSeconds, ceilToGrid } from "../time/clock";
import type { Placement, ProgramBlock, Reservation } from "../db/schema";

/**
 * Inventory availability.
 *
 * A placement sells time windows on a `lane`. Reservations in the same lane may
 * never overlap while HELD (unexpired) or CONFIRMED. Overlay placements that are
 * designed to coexist simply use different lanes.
 *
 * Two inventory modes:
 *   CONTINUOUS – any window on the slot grid inside the sales horizon.
 *   AD_BREAK   – windows must fit entirely inside an AD_BREAK program block.
 */

export type SlotStatus = "AVAILABLE" | "RESERVED" | "SOLD_OUT" | "UNAVAILABLE";

export interface Slot {
  startsAt: string;
  endsAt: string;
  status: SlotStatus;
  /** Present for AD_BREAK inventory: the containing program block. */
  blockId?: string;
  blockTitle?: string;
  /** Title of the program airing before this break (context for advertisers). */
  context?: string;
}

export interface AvailabilityResult {
  placementId: string;
  durationSec: number;
  serverTime: number;
  from: string;
  to: string;
  slots: Slot[];
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Reservations that block a lane inside [from, to). */
export async function blockingReservations(lane: string, from: Date, to: Date, now: Date, executor: Db | Tx = db()): Promise<Reservation[]> {
  return executor
    .select()
    .from(schema.reservations)
    .where(
      and(
        eq(schema.reservations.lane, lane),
        lt(schema.reservations.startsAt, to),
        gt(schema.reservations.endsAt, from),
        or(
          eq(schema.reservations.status, "CONFIRMED"),
          and(eq(schema.reservations.status, "HELD"), or(isNull(schema.reservations.expiresAt), gt(schema.reservations.expiresAt, now))),
        ),
      ),
    );
}

export async function findConflicts(lane: string, startsAt: Date, endsAt: Date, now: Date, executor: Db | Tx = db(), ignoreCampaignId?: string): Promise<Reservation[]> {
  const rows = await blockingReservations(lane, startsAt, endsAt, now, executor);
  return rows.filter((r) => !ignoreCampaignId || r.campaignId !== ignoreCampaignId);
}

function withinDailyWindow(placement: Placement, start: Date, end: Date): boolean {
  const w = placement.availability.hoursUtc;
  if (!w) return true;
  const h = start.getUTCHours() + start.getUTCMinutes() / 60;
  const he = end.getUTCHours() + end.getUTCMinutes() / 60 + (end.getUTCDate() !== start.getUTCDate() ? 24 : 0);
  if (w.from <= w.to) return h >= w.from && he <= w.to;
  return h >= w.from || he <= w.to;
}

function statusFor(reservations: Reservation[], start: Date, end: Date): SlotStatus {
  let status: SlotStatus = "AVAILABLE";
  for (const r of reservations) {
    if (!overlaps(start, end, r.startsAt, r.endsAt)) continue;
    if (r.status === "CONFIRMED") return "SOLD_OUT";
    status = "RESERVED";
  }
  return status;
}

/**
 * Compute bookable slots for a placement and duration in [from, to).
 * Slots are on the placement's grid, respect lead time, daily windows and (for
 * AD_BREAK inventory) must fit inside an AD_BREAK block.
 */
export async function computeAvailability(placement: Placement, durationSec: number, opts: { from?: Date; to?: Date; maxSlots?: number } = {}): Promise<AvailabilityResult> {
  const now = serverNow();
  const rules = placement.availability;
  const earliest = addSeconds(now, rules.leadTimeSec);
  const from = opts.from && opts.from > earliest ? opts.from : earliest;
  const horizonEnd = addSeconds(now, rules.horizonHours * 3600);
  const to = opts.to && opts.to < horizonEnd ? opts.to : horizonEnd;
  const maxSlots = opts.maxSlots ?? 400;
  const slots: Slot[] = [];

  if (durationSec < placement.minDurationSec || durationSec > placement.maxDurationSec) {
    return { placementId: placement.id, durationSec, serverTime: now.getTime(), from: from.toISOString(), to: to.toISOString(), slots };
  }

  const reservations = await blockingReservations(placement.lane, from, to, now);

  if (rules.inventoryMode === "AD_BREAK") {
    const blocks = await blocksInRange(placement.channelId, from, to);
    const breaks = blocks.filter((b) => b.type === "AD_BREAK");
    const byStart = [...blocks].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (const b of breaks) {
      const prev = byStart.filter((x) => x.endsAt.getTime() <= b.startsAt.getTime() && x.type !== "AD_BREAK").pop();
      let cursor = new Date(Math.max(b.startsAt.getTime(), ceilToGrid(from, rules.slotSeconds).getTime()));
      while (addSeconds(cursor, durationSec) <= b.endsAt && slots.length < maxSlots) {
        const end = addSeconds(cursor, durationSec);
        slots.push({
          startsAt: cursor.toISOString(),
          endsAt: end.toISOString(),
          status: statusFor(reservations, cursor, end),
          blockId: b.id,
          blockTitle: b.title,
          context: prev ? `After ${prev.title}` : undefined,
        });
        cursor = addSeconds(cursor, rules.slotSeconds);
      }
    }
  } else {
    let cursor = ceilToGrid(from, rules.slotSeconds);
    while (addSeconds(cursor, durationSec) <= to && slots.length < maxSlots) {
      const end = addSeconds(cursor, durationSec);
      const status: SlotStatus = withinDailyWindow(placement, cursor, end) ? statusFor(reservations, cursor, end) : "UNAVAILABLE";
      slots.push({ startsAt: cursor.toISOString(), endsAt: end.toISOString(), status });
      cursor = addSeconds(cursor, rules.slotSeconds);
    }
  }

  return { placementId: placement.id, durationSec, serverTime: now.getTime(), from: from.toISOString(), to: to.toISOString(), slots };
}

/** Validate that a requested window is a legal slot for the placement (grid, lead time, container). */
export async function validateWindow(placement: Placement, startsAt: Date, endsAt: Date, executor: Db | Tx = db()): Promise<{ ok: true; block?: ProgramBlock } | { ok: false; reason: string }> {
  const now = serverNow();
  const rules = placement.availability;
  const durationSec = Math.round((endsAt.getTime() - startsAt.getTime()) / 1000);
  if (durationSec < placement.minDurationSec || durationSec > placement.maxDurationSec) return { ok: false, reason: "Duration outside placement limits" };
  if (placement.durationOptionsSec.length && !placement.durationOptionsSec.includes(durationSec)) return { ok: false, reason: "Duration not offered for this placement" };
  if (startsAt.getTime() % (rules.slotSeconds * 1000) !== 0) return { ok: false, reason: "Start time is not on the slot grid" };
  if (startsAt < addSeconds(now, rules.leadTimeSec)) return { ok: false, reason: "Slot is too close to air" };
  if (endsAt > addSeconds(now, rules.horizonHours * 3600)) return { ok: false, reason: "Slot is beyond the sales horizon" };
  if (!withinDailyWindow(placement, startsAt, endsAt)) return { ok: false, reason: "Slot is outside the placement's daily window" };
  if (rules.inventoryMode === "AD_BREAK") {
    const blocks = await blocksInRange(placement.channelId, startsAt, endsAt, executor);
    const container = blocks.find((b) => b.type === "AD_BREAK" && b.startsAt <= startsAt && b.endsAt >= endsAt);
    if (!container) return { ok: false, reason: "Slot is not inside a commercial break" };
    return { ok: true, block: container };
  }
  return { ok: true };
}

/** Share of the surrounding UTC day already sold on the lane (for demand pricing). */
export async function laneOccupancy(placement: Placement, around: Date, executor: Db | Tx = db()): Promise<number> {
  const dayStart = new Date(Date.UTC(around.getUTCFullYear(), around.getUTCMonth(), around.getUTCDate()));
  const dayEnd = addSeconds(dayStart, 86400);
  const rows = await executor
    .select()
    .from(schema.reservations)
    .where(and(eq(schema.reservations.lane, placement.lane), inArray(schema.reservations.status, ["CONFIRMED"]), lt(schema.reservations.startsAt, dayEnd), gt(schema.reservations.endsAt, dayStart)));
  const sold = rows.reduce((acc, r) => acc + (Math.min(r.endsAt.getTime(), dayEnd.getTime()) - Math.max(r.startsAt.getTime(), dayStart.getTime())), 0);
  let sellable = 86400 * 1000;
  if (placement.availability.inventoryMode === "AD_BREAK") {
    const blocks = await blocksInRange(placement.channelId, dayStart, dayEnd, executor);
    sellable = blocks.filter((b) => b.type === "AD_BREAK").reduce((acc, b) => acc + (b.endsAt.getTime() - b.startsAt.getTime()), 0) || 1;
  }
  return Math.min(1, sold / sellable);
}
