import { publish } from "./bus";

/**
 * How many people are actually watching.
 *
 * This is a real count, not an impression of one: every open station tab holds
 * an event stream, and each stream keeps a presence slot warm while it is
 * connected. A tab that closes drops out within `TTL_MS`. Nothing here is
 * inflated, smoothed or seeded with a starting number — if one person is
 * watching, it says one.
 *
 * The stream deliberately recycles every 50 seconds (a serverless host would
 * kill it anyway), so presence is keyed by a per-tab id rather than by the
 * connection: reconnecting does not make a viewer blink out and back.
 *
 * One process only. Behind several instances each one counts its own viewers;
 * bridge this to the same shared store as the realtime bus to get a station-wide
 * figure.
 */

const TTL_MS = 45_000;
const SWEEP_MS = 10_000;

declare global {
  var __airtimePresence: { seen: Map<string, number>; timer: ReturnType<typeof setInterval> | null; last: number } | undefined;
}

function state() {
  if (!globalThis.__airtimePresence) globalThis.__airtimePresence = { seen: new Map(), timer: null, last: 0 };
  return globalThis.__airtimePresence;
}

function sweep(): number {
  const s = state();
  const cutoff = Date.now() - TTL_MS;
  for (const [id, at] of s.seen) if (at < cutoff) s.seen.delete(id);
  return s.seen.size;
}

/** Announce the count only when it actually changes, so the stream stays quiet. */
function announce(): void {
  const s = state();
  const count = sweep();
  if (count === s.last) return;
  s.last = count;
  publish({ type: "viewers", count });
}

function ensureSweeper(): void {
  const s = state();
  if (s.timer) return;
  s.timer = setInterval(announce, SWEEP_MS);
  s.timer.unref?.();
}

/** Mark a viewer as present. Called when their stream opens and on every ping. */
export function touchViewer(id: string): void {
  const s = state();
  const known = s.seen.has(id);
  s.seen.set(id, Date.now());
  ensureSweeper();
  if (!known) announce();
}

export function dropViewer(id: string): void {
  const s = state();
  if (s.seen.delete(id)) announce();
}

export function viewerCount(): number {
  return sweep();
}
