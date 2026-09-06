/**
 * Authoritative server clock.
 *
 * Every timing decision in AIRTIME (playback offset, activation, expiry) uses
 * `serverNow()` rather than raw `Date.now()` so a development simulation clock
 * can move the whole station forward/backward without changing system time.
 *
 * The offset is process-local and persisted in the settings table so it survives
 * dev-server restarts. Production leaves the offset at zero.
 */

declare global {
  var __airtimeClockOffsetMs: number | undefined;
}

export function clockOffsetMs(): number {
  return globalThis.__airtimeClockOffsetMs ?? 0;
}

export function setClockOffsetMs(ms: number): void {
  globalThis.__airtimeClockOffsetMs = Math.trunc(ms);
}

export function serverNow(): Date {
  return new Date(Date.now() + clockOffsetMs());
}

export function serverNowMs(): number {
  return Date.now() + clockOffsetMs();
}

/** Unix seconds (used for chain timestamps). */
export function serverNowSec(): number {
  return Math.floor(serverNowMs() / 1000);
}

export function addSeconds(d: Date, s: number): Date {
  return new Date(d.getTime() + s * 1000);
}

export function floorToGrid(d: Date, gridSec: number): Date {
  const g = gridSec * 1000;
  return new Date(Math.floor(d.getTime() / g) * g);
}

export function ceilToGrid(d: Date, gridSec: number): Date {
  const g = gridSec * 1000;
  return new Date(Math.ceil(d.getTime() / g) * g);
}
