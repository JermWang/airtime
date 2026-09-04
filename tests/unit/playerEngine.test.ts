import { describe, it, expect } from "vitest";
import { targetOffsetSec, driftCorrection, resolveMainSource, fullscreenCampaignAt, campaignForSlot, syncOffsetSec, SEEK_THRESHOLD_SEC, CATCHUP_RATE, SLOWDOWN_RATE } from "@/components/station/playerEngine";
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
  placementId: "MAIN_COMMERCIAL",
  placementName: "The commercial break",
  placementType: "FULLSCREEN",
  placementKind: "commercial",
  ownsMainStream: true,
  inventoryMode: "AD_BREAK" as const,
  startsAt: new Date(1_000_000).toISOString(),
  endsAt: null,
  guaranteedUntil: new Date(1_030_000).toISOString(),
  pricePaidWei: "1000000000000000",
  endedReason: null,
  runtimeSec: null,
  durationSec: null,
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
    expect(withAd.kind).toBe("campaign-video");
    if (withAd.kind === "campaign-video") expect(withAd.offsetSec).toBe(10);
    const image = resolveMainSource(adBreak, null, [campaign({ creative: { ...campaign().creative!, type: "IMAGE", url: "https://example.com/a.png" } })], 1_010_000);
    expect(image.kind).toBe("campaign-image");
    const empty = resolveMainSource(adBreak, block({ id: "n", title: "Sintel" }), [], 1_010_000);
    expect(empty.kind).toBe("slate");
    if (empty.kind === "slate") expect(empty.subtitle).toContain("Sintel");
  });

  it("ignores runs that have not started, runs already outbid, and overlays entirely", () => {
    const later = campaign({ startsAt: new Date(2_000_000).toISOString() });
    const outbid = campaign({ endsAt: new Date(1_005_000).toISOString() });
    const overlay = campaign({ placementType: "OVERLAY", ownsMainStream: false });
    expect(fullscreenCampaignAt([later, outbid, overlay], 1_010_000)).toBeNull();
  });

  it("keeps an open-ended run on the picture indefinitely: it ends only when outbid", () => {
    const running = campaign();
    expect(fullscreenCampaignAt([running], 1_010_000)?.id).toBe("c1");
    // Days later, still nobody has paid more.
    expect(fullscreenCampaignAt([running], 1_000_000 + 3 * 86_400_000)?.id).toBe("c1");
  });

  it("loops a short commercial inside a long break, in sync for every viewer", () => {
    const adBreak = block({ type: "AD_BREAK", mediaUrl: null, title: "Commercial break" });
    // 30s clip, 70s into the break → 10s in on its third pass.
    const src = resolveMainSource(adBreak, null, [campaign()], 1_070_000);
    expect(src.kind).toBe("campaign-video");
    if (src.kind === "campaign-video") expect(src.offsetSec).toBe(10);
  });

  it("lets a sponsorship placement own the picture when the placement says so", () => {
    const adBreak = block({ type: "AD_BREAK", mediaUrl: null, title: "Commercial break" });
    const bumper = campaign({ id: "c2", placementType: "SPONSORSHIP", placementKind: "station_id", ownsMainStream: true });
    const src = resolveMainSource(adBreak, null, [bumper], 1_010_000);
    expect(src.kind).toBe("campaign-video");
  });

  it("plays the show outside the breaks and the commercial inside them", () => {
    const programme = block();
    const adBreak = block({ id: "brk", type: "AD_BREAK", mediaUrl: null, title: "Commercial break", startsAt: new Date(1_000_000).toISOString() });
    const show = campaign({ id: "s1", placementId: "SHOW", displayName: "Somebody's film", inventoryMode: "CONTINUOUS" });
    const ad = campaign({ id: "a1", placementId: "AD", displayName: "A spot" });

    const duringShow = resolveMainSource(programme, null, [show, ad], 1_010_000);
    expect(duringShow.kind).toBe("campaign-video");
    if (duringShow.kind === "campaign-video") {
      expect(duringShow.slot).toBe("show");
      expect(duringShow.campaign.id).toBe("s1");
    }

    const duringBreak = resolveMainSource(adBreak, null, [show, ad], 1_010_000);
    expect(duringBreak.kind).toBe("campaign-video");
    if (duringBreak.kind === "campaign-video") {
      expect(duringBreak.slot).toBe("ad");
      expect(duringBreak.campaign.id).toBe("a1");
    }
  });

  it("hands an unsold break back to the show instead of cutting to a slate", () => {
    const adBreak = block({ type: "AD_BREAK", mediaUrl: null, title: "Commercial break" });
    const show = campaign({ id: "s1", placementId: "SHOW", inventoryMode: "CONTINUOUS" });
    const src = resolveMainSource(adBreak, null, [show], 1_010_000);
    expect(src.kind).toBe("campaign-video");
    if (src.kind === "campaign-video") expect(src.slot).toBe("show");
  });

  it("measures a show from its run start and a commercial from the break", () => {
    const adBreak = block({ type: "AD_BREAK", mediaUrl: null, title: "Commercial break", startsAt: new Date(1_200_000).toISOString() });
    const programme = block();
    // 30s creative, run started at 1_000_000: 70s in is 10s into its third pass.
    const show = campaign({ id: "s1", placementId: "SHOW", inventoryMode: "CONTINUOUS" });
    const showSrc = resolveMainSource(programme, null, [show], 1_070_000);
    if (showSrc.kind === "campaign-video") expect(showSrc.offsetSec).toBe(10);

    // The spot starts from the top of each break, whenever the run began.
    const ad = campaign({ id: "a1", placementId: "AD" });
    const adSrc = resolveMainSource(adBreak, null, [ad], 1_205_000);
    if (adSrc.kind === "campaign-video") expect(adSrc.offsetSec).toBe(5);
  });

  it("picks the right holder for each slot", () => {
    const show = campaign({ id: "s1", inventoryMode: "CONTINUOUS" });
    const ad = campaign({ id: "a1" });
    expect(campaignForSlot([show, ad], "show", 1_010_000)?.id).toBe("s1");
    expect(campaignForSlot([show, ad], "ad", 1_010_000)?.id).toBe("a1");
    expect(campaignForSlot([show], "ad", 1_010_000)).toBeNull();
  });

  it("loops submitted media by its own length, so nothing ever runs out", () => {
    expect(syncOffsetSec({ anchorMs: 0, durationSec: 30 }, 95_000)).toBe(5);
    expect(syncOffsetSec({ anchorMs: 0, durationSec: 1800 }, 1_800_000)).toBe(0);
    // Unknown length (a linked WebM): play straight through from the anchor.
    expect(syncOffsetSec({ anchorMs: 0, durationSec: null }, 12_000)).toBe(12);
  });

  it("uses hls for live blocks", () => {
    const src = resolveMainSource(block({ type: "LIVE_HLS", mediaUrl: "https://example.com/live.m3u8" }), null, [], 1_010_000);
    expect(src.kind).toBe("hls");
  });
});
