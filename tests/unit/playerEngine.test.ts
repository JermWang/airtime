import { describe, it, expect } from "vitest";
import { targetOffsetSec, driftCorrection, resolveMainSource, fullscreenCampaignAt, SEEK_THRESHOLD_SEC, CATCHUP_RATE, SLOWDOWN_RATE } from "@/components/station/playerEngine";
import type { ProgramBlockDto, QueueEntryDto } from "@/lib/api";

const block = (over: Partial<ProgramBlockDto> = {}): ProgramBlockDto => ({
  id: "b1",
  channelId: "MAIN",
  type: "VOD",
  title: "Film",
  mediaUrl: "https://example.com/film.mp4",
  startsAt: new Date(1_000_000).toISOString(),
  endsAt: new Date(1_600_000).toISOString(),
  durationSec: 600,
  metadata: {},
  isManual: false,
  isDevData: true,
  ...over,
});

const campaign = (over: Partial<QueueEntryDto> = {}): QueueEntryDto => ({
  id: "c1",
  displayName: "Brand",
  status: "AIRING",
  placementId: "MAIN_COMMERCIAL_30",
  placementName: "30s",
  placementType: "FULLSCREEN",
  placementKind: "commercial",
  ownsMainStream: true,
  startsAt: new Date(1_000_000).toISOString(),
  endsAt: new Date(1_030_000).toISOString(),
  durationSec: 30,
  wallet: "0xab…cd",
  txHash: null,
  txUrl: null,
  creative: { id: "cr", type: "VIDEO", status: "VALID", url: "https://example.com/ad.mp4", posterUrl: null, mimeType: "video/mp4", width: 1920, height: 1080, durationSec: 30, hasAudio: true, textContent: null, clickUrl: null, creativeHash: "0x", contentHash: "", validationErrors: [], warnings: [], createdAt: "" },
  fit: "FIT",
  clickUrl: null,
  ...over,
});

describe("synchronized playback", () => {
  it("computes the same offset for every viewer from server time", () => {
    expect(targetOffsetSec(block(), 1_000_000)).toBe(0);
    expect(targetOffsetSec(block(), 1_125_500)).toBe(125.5);
  });

  it("honours resume offsets for blocks split by an interrupt", () => {
    expect(targetOffsetSec(block({ metadata: { resumeOffsetSec: 40 } }), 1_010_000)).toBe(50);
  });

  it("seeks on large drift, nudges rate on small drift, does nothing when in sync", () => {
    expect(driftCorrection(100, 100.1)).toEqual({ action: "none", rate: 1 });
    expect(driftCorrection(100, 101)).toEqual({ action: "rate", rate: CATCHUP_RATE });
    expect(driftCorrection(101, 100)).toEqual({ action: "rate", rate: SLOWDOWN_RATE });
    expect(driftCorrection(100, 100 + SEEK_THRESHOLD_SEC + 1)).toEqual({ action: "seek", to: 100 + SEEK_THRESHOLD_SEC + 1 });
  });

  it("plays the scheduled VOD at the computed offset", () => {
    const src = resolveMainSource(block(), null, [], 1_060_000);
    expect(src.kind).toBe("vod");
    if (src.kind === "vod") expect(src.offsetSec).toBe(60);
  });

  it("plays the paid full-screen campaign during an AD_BREAK and a slate otherwise", () => {
    const adBreak = block({ type: "AD_BREAK", mediaUrl: null, title: "Commercial break" });
    const withAd = resolveMainSource(adBreak, block({ id: "n" }), [campaign()], 1_010_000);
    expect(withAd.kind).toBe("ad-video");
    if (withAd.kind === "ad-video") expect(withAd.offsetSec).toBe(10);
    const image = resolveMainSource(adBreak, null, [campaign({ creative: { ...campaign().creative!, type: "IMAGE", url: "https://example.com/a.png" } })], 1_010_000);
    expect(image.kind).toBe("ad-image");
    const empty = resolveMainSource(adBreak, block({ id: "n", title: "Sintel" }), [], 1_010_000);
    expect(empty.kind).toBe("slate");
    if (empty.kind === "slate") expect(empty.subtitle).toContain("Sintel");
  });

  it("ignores full-screen campaigns outside their window and overlays entirely", () => {
    const later = campaign({ startsAt: new Date(2_000_000).toISOString(), endsAt: new Date(2_030_000).toISOString() });
    const overlay = campaign({ placementType: "OVERLAY", ownsMainStream: false });
    expect(fullscreenCampaignAt([later, overlay], 1_010_000)).toBeNull();
  });

  it("lets a sponsorship placement own the picture when the placement says so", () => {
    const adBreak = block({ type: "AD_BREAK", mediaUrl: null, title: "Commercial break" });
    const bumper = campaign({ id: "c2", placementType: "SPONSORSHIP", placementKind: "station_id", ownsMainStream: true });
    const src = resolveMainSource(adBreak, null, [bumper], 1_010_000);
    expect(src.kind).toBe("ad-video");
  });

  it("uses hls for live blocks", () => {
    const src = resolveMainSource(block({ type: "LIVE_HLS", mediaUrl: "https://example.com/live.m3u8" }), null, [], 1_010_000);
    expect(src.kind).toBe("hls");
  });
});
