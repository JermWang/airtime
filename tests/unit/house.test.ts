import { describe, it, expect } from "vitest";
import { houseForPlacement, pickHouse, houseAt, houseMedia, HOUSE_ROTATION_SEC } from "@/lib/house";
import type { ShowcaseDto } from "@/lib/api";

const card = (over: Partial<ShowcaseDto> = {}): ShowcaseDto => ({
  id: "h1",
  slug: "h1",
  placementId: "PANEL_LEFT",
  label: "Placeholder",
  headline: "House reel",
  sublabel: null,
  accent: "#ccff00",
  mediaUrl: null,
  mediaType: null,
  posterUrl: null,
  durationSec: null,
  fit: "FILL",
  sortOrder: 0,
  isActive: true,
  ...over,
});

describe("house content on an unbooked surface", () => {
  it("takes only what is pinned to the surface, switched on, artwork first", () => {
    const cards = [
      card({ id: "text", slug: "text", sortOrder: 1 }),
      card({ id: "off", slug: "off", isActive: false, mediaUrl: "/placeholders/a.mp4", mediaType: "VIDEO" }),
      card({ id: "elsewhere", slug: "elsewhere", placementId: "PANEL_RIGHT" }),
      card({ id: "clip", slug: "clip", sortOrder: 9, mediaUrl: "/placeholders/b.mp4", mediaType: "VIDEO" }),
    ];
    expect(houseForPlacement(cards, "PANEL_LEFT").map((c) => c.id)).toEqual(["clip", "text"]);
    expect(houseForPlacement(cards, "AD")).toEqual([]);
    expect(houseForPlacement(undefined, "PANEL_LEFT")).toEqual([]);
  });

  it("puts every viewer on the same placeholder at the same moment", () => {
    const cards = [card({ id: "a", slug: "a" }), card({ id: "b", slug: "b", sortOrder: 1 })];
    const t = 1_000 * HOUSE_ROTATION_SEC * 7;
    expect(pickHouse(cards, t)?.id).toBe(pickHouse(cards, t + 1_400)?.id);
    expect(pickHouse(cards, t)?.id).not.toBe(pickHouse(cards, t + HOUSE_ROTATION_SEC * 1_000)?.id);
    // One card holds the surface outright; none means the surface stays empty.
    expect(pickHouse([cards[0]], t)?.id).toBe("a");
    expect(pickHouse([], t)).toBeNull();
    expect(houseAt(cards, "PANEL_RIGHT", t)).toBeNull();
  });

  it("reads media off a row only once it has artwork", () => {
    expect(houseMedia(card())).toBeNull();
    expect(houseMedia(null)).toBeNull();
    expect(houseMedia(card({ mediaUrl: "/placeholders/a.mp4", mediaType: "VIDEO", durationSec: 12 }))).toEqual({
      url: "/placeholders/a.mp4",
      kind: "video",
      posterUrl: null,
      durationSec: 12,
    });
    expect(houseMedia(card({ mediaUrl: "/placeholders/a.png", mediaType: "IMAGE" }))?.kind).toBe("image");
  });
});
