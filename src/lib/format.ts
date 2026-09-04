import { formatUnits } from "viem";

export function shortAddress(address: string | null | undefined, chars = 4): string {
  if (!address) return "—";
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function shortHash(hash: string | null | undefined): string {
  if (!hash) return "—";
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

/** Format wei (as bigint or decimal string) to a compact ETH string. */
export function formatWei(wei: bigint | string | null | undefined, decimals = 18, symbol = "ETH"): string {
  if (wei === null || wei === undefined) return "—";
  const value = typeof wei === "bigint" ? wei : BigInt(wei);
  const str = formatUnits(value, decimals);
  const [int, frac = ""] = str.split(".");
  let trimmed = frac.replace(/0+$/, "");
  if (trimmed.length > 6) trimmed = trimmed.slice(0, 6);
  return `${int}${trimmed ? "." + trimmed : ""} ${symbol}`;
}

/**
 * Parts per million rendered as a percentage: 50 ppm → "0.005".
 *
 * Integer arithmetic, because this number is a share of an asset. Dividing and
 * calling toFixed would round 0.005% to nothing at two decimal places.
 */
export function formatPercentFromPpm(ppm: number): string {
  const scaled = Math.round(ppm);
  const sign = scaled < 0 ? "-" : "";
  const abs = Math.abs(scaled);
  const whole = Math.floor(abs / 10_000);
  const frac = String(abs % 10_000).padStart(4, "0").replace(/0+$/, "");
  return `${sign}${whole}${frac ? `.${frac}` : ""}`;
}

export function formatDurationSec(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatClock(d: Date | string | number, withSeconds = true): string {
  const date = typeof d === "object" ? d : new Date(d);
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" };
  if (withSeconds) opts.second = "2-digit";
  return new Intl.DateTimeFormat("en-GB", opts).format(date);
}

export function formatDateTime(d: Date | string | number | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "object" ? d : new Date(d);
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date) + " UTC";
}

export function formatRelative(target: Date | string | number, now: number): string {
  const t = typeof target === "object" ? target.getTime() : new Date(target).getTime();
  const diff = Math.round((t - now) / 1000);
  const abs = Math.abs(diff);
  const label = abs < 60 ? `${abs}s` : abs < 3600 ? `${Math.floor(abs / 60)}m` : `${Math.floor(abs / 3600)}h ${Math.floor((abs % 3600) / 60)}m`;
  return diff >= 0 ? `in ${label}` : `${label} ago`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}
