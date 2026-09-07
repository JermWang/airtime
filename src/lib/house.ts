import type { ShowcaseDto } from "./api";

/**
 * House content on an unbooked surface.
 *
 * These are the station's own placeholders — a text card, or media the station
 * hosts itself — shown while nobody holds a surface. They are never a campaign:
 * they carry a permanent EXAMPLE badge wherever they are drawn, never enter the
 * broadcast queue and never count as revenue.
 *
 * Selection is pure and derived from server time, so every viewer in the room
 * lands on the same placeholder at the same moment, the same way the programme
 * itself stays in sync.
 */

/** How long one placeholder holds a surface before the next takes its turn. */
export const HOUSE_ROTATION_SEC = 15;

/** Everything pinned to `placementId`, media first, then by sort order. */
export function houseForPlacement(cards: ShowcaseDto[] | undefined, placementId: string): ShowcaseDto[] {
  return (cards ?? [])
    .filter((c) => c.isActive && c.placementId === placementId)
    .sort((a, b) => Number(Boolean(b.mediaUrl)) - Number(Boolean(a.mediaUrl)) || a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));
}

/** The one on the surface at `nowMs`. */
export function pickHouse(cards: ShowcaseDto[], nowMs: number, rotationSec = HOUSE_ROTATION_SEC): ShowcaseDto | null {
  if (cards.length === 0) return null;
  if (cards.length === 1) return cards[0];
  const step = Math.floor(nowMs / (rotationSec * 1000));
  return cards[((step % cards.length) + cards.length) % cards.length];
}

/** The house content on `placementId` right now, or null if there is none. */
export function houseAt(cards: ShowcaseDto[] | undefined, placementId: string, nowMs: number): ShowcaseDto | null {
  return pickHouse(houseForPlacement(cards, placementId), nowMs);
}

/** Whether this row is media rather than a text-only card. */
export function houseMedia(card: ShowcaseDto | null): { url: string; kind: "video" | "image"; posterUrl: string | null; durationSec: number | null } | null {
  if (!card?.mediaUrl) return null;
  return { url: card.mediaUrl, kind: card.mediaType === "VIDEO" ? "video" : "image", posterUrl: card.posterUrl, durationSec: card.durationSec };
}
