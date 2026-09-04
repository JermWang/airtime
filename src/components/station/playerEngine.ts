import type { ProgramBlockDto, QueueEntryDto } from "@/lib/api";

/**
 * Pure synchronization logic for the linear player (unit-tested).
 *
 * Every viewer computes the same target offset from server time; the element
 * is nudged toward it with playbackRate changes for small drift and a seek for
 * large drift.
 */

export const SEEK_THRESHOLD_SEC = 2.5;
export const RATE_THRESHOLD_SEC = 0.35;
export const CATCHUP_RATE = 1.06;
export const SLOWDOWN_RATE = 0.94;

/** Seconds into the block's media at `nowMs`, including a resume offset for split blocks. */
export function targetOffsetSec(block: Pick<ProgramBlockDto, "startsAt" | "metadata">, nowMs: number): number {
  const start = new Date(block.startsAt).getTime();
  const resume = Number((block.metadata as { resumeOffsetSec?: number }).resumeOffsetSec ?? 0);
  return Math.max(0, (nowMs - start) / 1000 + resume);
}

export type DriftAction = { action: "none"; rate: 1 } | { action: "rate"; rate: number } | { action: "seek"; to: number };

export function driftCorrection(currentTimeSec: number, targetSec: number): DriftAction {
  const drift = currentTimeSec - targetSec; // positive = ahead of schedule
  const abs = Math.abs(drift);
  if (abs > SEEK_THRESHOLD_SEC) return { action: "seek", to: targetSec };
  if (abs > RATE_THRESHOLD_SEC) return { action: "rate", rate: drift > 0 ? SLOWDOWN_RATE : CATCHUP_RATE };
  return { action: "none", rate: 1 };
}

/**
 * The campaign that owns the main broadcast picture at `nowMs`, if any.
 * Ownership is declared by the placement (`ownsMainStream`), so commercials,
 * channel takeovers and station-ID bumpers all work without special cases.
 */
export function fullscreenCampaignAt(entries: QueueEntryDto[], nowMs: number): QueueEntryDto | null {
  for (const e of entries) {
    if (!e.ownsMainStream || !e.startsAt || !e.endsAt) continue;
    const s = new Date(e.startsAt).getTime();
    const en = new Date(e.endsAt).getTime();
    if (s <= nowMs && nowMs < en) return e;
  }
  return null;
}

export type MainSource =
  | { kind: "vod"; url: string; block: ProgramBlockDto; offsetSec: number }
  | { kind: "hls"; url: string; block: ProgramBlockDto; live: boolean; offsetSec: number }
  | { kind: "ad-video"; url: string; campaign: QueueEntryDto; offsetSec: number }
  | { kind: "ad-image"; url: string; campaign: QueueEntryDto }
  | { kind: "slate"; title: string; subtitle: string; block: ProgramBlockDto | null };

/** Decide what the main stream should show right now. */
export function resolveMainSource(block: ProgramBlockDto | null, next: ProgramBlockDto | null, campaigns: QueueEntryDto[], nowMs: number): MainSource {
  if (!block) return { kind: "slate", title: "AIRTIME", subtitle: "Stand by", block: null };
  if (block.type === "AD_BREAK") {
    const c = fullscreenCampaignAt(campaigns, nowMs);
    if (c?.creative?.url) {
      if (c.creative.type === "VIDEO") {
        const offsetSec = Math.max(0, (nowMs - new Date(c.startsAt!).getTime()) / 1000);
        return { kind: "ad-video", url: c.creative.url, campaign: c, offsetSec };
      }
      return { kind: "ad-image", url: c.creative.url, campaign: c };
    }
    return { kind: "slate", title: "We'll be right back", subtitle: next ? `Up next · ${next.title}` : "AIRTIME", block };
  }
  if (block.type === "BUMPER") {
    if (block.mediaUrl) return { kind: "vod", url: block.mediaUrl, block, offsetSec: targetOffsetSec(block, nowMs) };
    return { kind: "slate", title: "AIRTIME", subtitle: block.title, block };
  }
  if (block.type === "LIVE_HLS") {
    if (block.mediaUrl) return { kind: "hls", url: block.mediaUrl, block, live: true, offsetSec: 0 };
    return { kind: "slate", title: "LIVE", subtitle: block.title, block };
  }
  if (!block.mediaUrl) return { kind: "slate", title: "AIRTIME", subtitle: block.title, block };
  // VOD delivered over HLS (e.g. a hosted media provider) still synchronises by offset.
  if (block.mediaUrl.toLowerCase().split("?")[0].endsWith(".m3u8")) return { kind: "hls", url: block.mediaUrl, block, live: false, offsetSec: targetOffsetSec(block, nowMs) };
  return { kind: "vod", url: block.mediaUrl, block, offsetSec: targetOffsetSec(block, nowMs) };
}

export function sourceKey(src: MainSource): string {
  switch (src.kind) {
    case "vod":
      return `vod:${src.block.id}`;
    case "hls":
      return `hls:${src.block.id}`;
    case "ad-video":
      return `adv:${src.campaign.id}`;
    case "ad-image":
      return `adi:${src.campaign.id}`;
    default:
      return `slate:${src.block?.id ?? "none"}:${src.title}`;
  }
}
