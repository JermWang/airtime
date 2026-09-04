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
 * Which product a campaign bought. A surface that owns the picture is either the
 * show (it runs whenever a break is not on) or the commercial (it runs in the
 * breaks); the placement's inventory mode is what says which.
 */
export type Slot = "show" | "ad";

export function slotOf(entry: QueueEntryDto): Slot | null {
  if (!entry.ownsMainStream) return null;
  return entry.inventoryMode === "AD_BREAK" ? "ad" : "show";
}

/**
 * The campaign holding a slot at `nowMs`.
 *
 * A run has no scheduled end: it owns its slot from the moment it took the
 * screen until somebody outbids it, which is when `endsAt` finally gets a value.
 */
export function campaignForSlot(entries: QueueEntryDto[], slot: Slot, nowMs: number): QueueEntryDto | null {
  for (const e of entries) {
    if (slotOf(e) !== slot || !e.startsAt) continue;
    if (new Date(e.startsAt).getTime() > nowMs) continue;
    if (e.endsAt && new Date(e.endsAt).getTime() <= nowMs) continue;
    return e;
  }
  return null;
}

/** Kept for the station HUD: whatever owns the picture right now, either product. */
export function fullscreenCampaignAt(entries: QueueEntryDto[], nowMs: number): QueueEntryDto | null {
  return campaignForSlot(entries, "ad", nowMs) ?? campaignForSlot(entries, "show", nowMs);
}

/**
 * Where a piece of submitted media should be at `nowMs`.
 *
 * `anchorMs` is the instant the loop is measured from — the start of the break
 * for a commercial, so it plays from the top of every break, and the start of
 * the run for a show, so a thirty-minute show plays through and repeats. Every
 * viewer derives the same number from server time, which is what keeps the room
 * watching the same frame.
 */
export interface PlaybackSync {
  anchorMs: number;
  durationSec: number | null;
}

export function syncOffsetSec(sync: PlaybackSync, nowMs: number): number {
  const elapsed = Math.max(0, (nowMs - sync.anchorMs) / 1000);
  return sync.durationSec && sync.durationSec > 0.5 ? elapsed % sync.durationSec : elapsed;
}

function isHls(url: string): boolean {
  return url.toLowerCase().split("?")[0].endsWith(".m3u8");
}

export type MainSource =
  | { kind: "vod"; url: string; block: ProgramBlockDto; offsetSec: number }
  | { kind: "hls"; url: string; block: ProgramBlockDto; live: boolean; offsetSec: number }
  | { kind: "campaign-video"; url: string; hls: boolean; campaign: QueueEntryDto; slot: Slot; sync: PlaybackSync; offsetSec: number }
  | { kind: "campaign-image"; url: string; campaign: QueueEntryDto; slot: Slot }
  | { kind: "slate"; title: string; subtitle: string; block: ProgramBlockDto | null };

function campaignSource(campaign: QueueEntryDto, slot: Slot, anchorMs: number, nowMs: number): MainSource | null {
  const creative = campaign.creative;
  if (!creative?.url) return null;
  if (creative.type === "VIDEO") {
    const sync: PlaybackSync = { anchorMs, durationSec: creative.durationSec ?? null };
    return { kind: "campaign-video", url: creative.url, hls: isHls(creative.url), campaign, slot, sync, offsetSec: syncOffsetSec(sync, nowMs) };
  }
  return { kind: "campaign-image", url: creative.url, campaign, slot };
}

/**
 * Decide what the screen should show right now.
 *
 * During a commercial break the spot plays, if anybody holds it. The rest of the
 * time the show plays, if anybody holds it. When nobody has bought either, the
 * station's own programming fills the room — and an unsold break never becomes
 * dead air, because the show simply keeps running through it.
 */
export function resolveMainSource(block: ProgramBlockDto | null, next: ProgramBlockDto | null, campaigns: QueueEntryDto[], nowMs: number): MainSource {
  if (!block) return { kind: "slate", title: "AIRTIME", subtitle: "Stand by", block: null };

  const show = campaignForSlot(campaigns, "show", nowMs);

  if (block.type === "AD_BREAK") {
    const ad = campaignForSlot(campaigns, "ad", nowMs);
    if (ad) {
      const source = campaignSource(ad, "ad", new Date(block.startsAt).getTime(), nowMs);
      if (source) return source;
    }
    // Nobody bought the break: hand the room back to the show rather than cut to black.
    if (show) {
      const source = campaignSource(show, "show", new Date(show.startsAt!).getTime(), nowMs);
      if (source) return source;
    }
    return { kind: "slate", title: "We'll be right back", subtitle: next ? `Up next · ${next.title}` : "AIRTIME", block };
  }

  if (show) {
    const source = campaignSource(show, "show", new Date(show.startsAt!).getTime(), nowMs);
    if (source) return source;
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
  if (isHls(block.mediaUrl)) return { kind: "hls", url: block.mediaUrl, block, live: false, offsetSec: targetOffsetSec(block, nowMs) };
  return { kind: "vod", url: block.mediaUrl, block, offsetSec: targetOffsetSec(block, nowMs) };
}

export function sourceKey(src: MainSource): string {
  switch (src.kind) {
    case "vod":
      return `vod:${src.block.id}`;
    case "hls":
      return `hls:${src.block.id}`;
    case "campaign-video":
      // A show keeps its identity across program boundaries so it plays through;
      // a commercial reloads with each break so it starts from the top.
      return src.slot === "show" ? `show:${src.campaign.id}` : `ad:${src.campaign.id}:${Math.floor(src.sync.anchorMs / 1000)}`;
    case "campaign-image":
      return `img:${src.campaign.id}`;
    default:
      return `slate:${src.block?.id ?? "none"}:${src.title}`;
  }
}
