import bcrypt from "bcryptjs";
import { and, eq, gt, inArray, like, ne, notInArray } from "drizzle-orm";
import { db, schema } from "./client";
import { env, devDataAllowed, isProduction } from "../env";
import { ensureScheduleHorizon } from "../broadcast/schedule";
import { serverNow } from "../time/clock";
import { MAX_DIRECT_UPLOAD_BYTES } from "@/lib/upload";
import { MIN_PRICE_WEI } from "@/lib/auction";
import type { NewPlacement, PlacementAuctionRules, PlacementAvailabilityRules } from "./schema";

/**
 * Seed data.
 *
 *   ensureBaseline()  – channel, admin user, placements. Runs in every environment
 *                       when the corresponding table is empty (idempotent).
 *   seedDevData()     – sample programming (public Blender films, clearly labelled
 *                       DEV DATA). Never runs on mainnet / when disabled.
 */

const SOL = 10n ** 9n;
const continuous = (hoursUtc: { from: number; to: number } | null = null): PlacementAvailabilityRules => ({ inventoryMode: "CONTINUOUS", hoursUtc });
const adBreak = (): PlacementAvailabilityRules => ({ inventoryMode: "AD_BREAK", hoursUtc: null });

/** SOL as a decimal with three places, returned as integer lamports. sol(2.5) = 2.5 SOL. */
const sol = (n: number) => ((SOL * BigInt(Math.round(n * 1000))) / 1000n).toString();

/**
 * A configured price, never below the station minimum. Defaults to it, which is
 * what every placement here opens at.
 */
const startingPrice = (n?: number) => {
  const wei = n === undefined ? MIN_PRICE_WEI : BigInt(sol(n));
  return (wei > MIN_PRICE_WEI ? wei : MIN_PRICE_WEI).toString();
};

/**
 * Auction rules.
 *
 * Everything opens at 0.5 SOL and stays there until somebody buys it. A sale
 * is what moves the price: the ask jumps to `takeoverPremiumBps` of whatever
 * was paid and then walks back down over `decayHours`, never below what the
 * current holder paid plus 5%. Demand is the only thing that raises a price
 * here, and time is the only thing that lowers one.
 */
const auction = (opts: { opening?: number; floor?: number; decayHours: number; minHoldMinutes: number; takeoverPremiumBps?: number; minIncrementBps?: number; maxHoldSeconds?: number }): PlacementAuctionRules => ({
  openingPriceWei: startingPrice(opts.opening),
  floorPriceWei: startingPrice(opts.floor),
  decaySeconds: Math.round(opts.decayHours * 3600),
  takeoverPremiumBps: opts.takeoverPremiumBps ?? 20_000,
  minIncrementBps: opts.minIncrementBps ?? 500,
  minHoldSeconds: Math.round(opts.minHoldMinutes * 60),
  maxHoldSeconds: opts.maxHoldSeconds ?? 0,
});

/** Longest submission accepted, and so the longest guaranteed run. */
export const SHOW_MAX_SECONDS = 30 * 60;
export const AD_MAX_SECONDS = 30;

export const BASE_PLACEMENTS: NewPlacement[] = [
  {
    id: "SHOW",
    channelId: "MAIN",
    name: "Runtime",
    description: "The screen itself. Your show plays to the room, in sync for everyone watching, from the moment you take it until somebody pays more. Up to 30 minutes, uploaded or linked.",
    type: "FULLSCREEN",
    kind: "show",
    aspectRatio: "16:9",
    mediaTypes: ["VIDEO"],
    auction: auction({ decayHours: 3, minHoldMinutes: 30 }),
    availability: continuous(),
    lane: "show",
    ownsMainStream: true,
    meshName: "Screen_Main",
    transform: null,
    material: { emissiveIntensity: 1.05, fit: "FIT", idleKind: "house" },
    maxWidth: 3840,
    maxHeight: 2160,
    maxCreativeSec: SHOW_MAX_SECONDS,
    maxFileBytes: MAX_DIRECT_UPLOAD_BYTES,
    allowsAudio: true,
    allowsClickThrough: false,
    requiresModeration: false,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: "AD",
    channelId: "MAIN",
    name: "Commercial",
    description: "A spot in the break. Plays before and between shows, every break, for as long as you hold it. Up to 30 seconds, uploaded or linked.",
    type: "FULLSCREEN",
    kind: "ad",
    aspectRatio: "16:9",
    mediaTypes: ["VIDEO", "IMAGE"],
    auction: auction({ decayHours: 2, minHoldMinutes: 15 }),
    availability: adBreak(),
    lane: "ad",
    ownsMainStream: true,
    meshName: "Screen_Main",
    transform: null,
    material: { emissiveIntensity: 1.05, fit: "FIT", idleKind: "house" },
    maxWidth: 3840,
    maxHeight: 2160,
    maxCreativeSec: AD_MAX_SECONDS,
    maxFileBytes: MAX_DIRECT_UPLOAD_BYTES,
    allowsAudio: true,
    allowsClickThrough: false,
    requiresModeration: false,
    isActive: true,
    sortOrder: 2,
  },
  {
    id: "PANEL_LEFT",
    channelId: "MAIN",
    name: "Left display panel",
    description: "The left-hand panel beside the picture. Your spot sits there the whole time, through the show and through the breaks, until somebody pays more. Up to 30 seconds, uploaded or linked.",
    type: "ENVIRONMENT",
    kind: "panel",
    aspectRatio: "16:9",
    mediaTypes: ["IMAGE", "VIDEO"],
    auction: auction({ decayHours: 4, minHoldMinutes: 20 }),
    availability: continuous(),
    lane: "panel_left",
    ownsMainStream: false,
    meshName: "Panel_Left",
    transform: null,
    material: { emissiveIntensity: 0.95, fit: "FILL", idleKind: "house" },
    maxWidth: 1920,
    maxHeight: 1080,
    maxCreativeSec: AD_MAX_SECONDS,
    maxFileBytes: 48 * 1024 * 1024,
    allowsAudio: false,
    allowsClickThrough: true,
    requiresModeration: false,
    isActive: true,
    sortOrder: 3,
  },
  {
    id: "PANEL_RIGHT",
    channelId: "MAIN",
    name: "Right display panel",
    description: "The right-hand panel beside the picture. Your spot sits there the whole time, through the show and through the breaks, until somebody pays more. Up to 30 seconds, uploaded or linked.",
    type: "ENVIRONMENT",
    kind: "panel",
    aspectRatio: "16:9",
    mediaTypes: ["IMAGE", "VIDEO"],
    auction: auction({ decayHours: 4, minHoldMinutes: 20 }),
    availability: continuous(),
    lane: "panel_right",
    ownsMainStream: false,
    meshName: "Panel_Right",
    transform: null,
    material: { emissiveIntensity: 0.95, fit: "FILL", idleKind: "house" },
    maxWidth: 1920,
    maxHeight: 1080,
    maxCreativeSec: AD_MAX_SECONDS,
    maxFileBytes: 48 * 1024 * 1024,
    allowsAudio: false,
    allowsClickThrough: true,
    requiresModeration: false,
    isActive: true,
    sortOrder: 4,
  },
  {
    id: "PANEL_TOP_LEFT",
    channelId: "MAIN",
    name: "Top-left panel",
    description: "The left-hand panel on the row above the picture. Your spot sits there the whole time, through the show and through the breaks, until somebody pays more. Up to 30 seconds, uploaded or linked.",
    type: "ENVIRONMENT",
    kind: "panel",
    aspectRatio: "16:9",
    mediaTypes: ["IMAGE", "VIDEO"],
    auction: auction({ decayHours: 4, minHoldMinutes: 20 }),
    availability: continuous(),
    lane: "panel_top_left",
    ownsMainStream: false,
    meshName: "Panel_TopLeft",
    transform: null,
    material: { emissiveIntensity: 0.95, fit: "FILL", idleKind: "house" },
    maxWidth: 1920,
    maxHeight: 1080,
    maxCreativeSec: AD_MAX_SECONDS,
    maxFileBytes: 48 * 1024 * 1024,
    allowsAudio: false,
    allowsClickThrough: true,
    requiresModeration: false,
    isActive: true,
    sortOrder: 5,
  },
  {
    id: "PANEL_TOP_MID",
    channelId: "MAIN",
    name: "Top-centre panel",
    description: "The centre panel on the row above the picture. Your spot sits there the whole time, through the show and through the breaks, until somebody pays more. Up to 30 seconds, uploaded or linked.",
    type: "ENVIRONMENT",
    kind: "panel",
    aspectRatio: "16:9",
    mediaTypes: ["IMAGE", "VIDEO"],
    auction: auction({ decayHours: 4, minHoldMinutes: 20 }),
    availability: continuous(),
    lane: "panel_top_mid",
    ownsMainStream: false,
    meshName: "Panel_TopMid",
    transform: null,
    material: { emissiveIntensity: 0.95, fit: "FILL", idleKind: "house" },
    maxWidth: 1920,
    maxHeight: 1080,
    maxCreativeSec: AD_MAX_SECONDS,
    maxFileBytes: 48 * 1024 * 1024,
    allowsAudio: false,
    allowsClickThrough: true,
    requiresModeration: false,
    isActive: true,
    sortOrder: 6,
  },
  {
    id: "PANEL_TOP_RIGHT",
    channelId: "MAIN",
    name: "Top-right panel",
    description: "The square panel at the end of the row above the picture. Your spot sits there the whole time, through the show and through the breaks, until somebody pays more. Up to 30 seconds, uploaded or linked.",
    type: "ENVIRONMENT",
    kind: "panel",
    aspectRatio: "1:1",
    mediaTypes: ["IMAGE", "VIDEO"],
    auction: auction({ decayHours: 4, minHoldMinutes: 20 }),
    availability: continuous(),
    lane: "panel_top_right",
    ownsMainStream: false,
    meshName: "Panel_TopRight",
    transform: null,
    material: { emissiveIntensity: 0.95, fit: "FILL", idleKind: "house" },
    maxWidth: 1080,
    maxHeight: 1080,
    maxCreativeSec: AD_MAX_SECONDS,
    maxFileBytes: 48 * 1024 * 1024,
    allowsAudio: false,
    allowsClickThrough: true,
    requiresModeration: false,
    isActive: true,
    sortOrder: 7,
  },
  {
    id: "PANEL_TOWER",
    channelId: "MAIN",
    name: "Tower panel",
    description: "The tall panel standing outboard of the wall, the full height of the picture. Your spot sits there the whole time, through the show and through the breaks, until somebody pays more. Up to 30 seconds, uploaded or linked.",
    type: "ENVIRONMENT",
    kind: "panel",
    aspectRatio: "9:16",
    mediaTypes: ["IMAGE", "VIDEO"],
    auction: auction({ decayHours: 4, minHoldMinutes: 20 }),
    availability: continuous(),
    lane: "panel_tower",
    ownsMainStream: false,
    meshName: "Panel_Tower",
    transform: null,
    material: { emissiveIntensity: 0.95, fit: "FILL", idleKind: "house" },
    maxWidth: 1080,
    maxHeight: 1920,
    maxCreativeSec: AD_MAX_SECONDS,
    maxFileBytes: 48 * 1024 * 1024,
    allowsAudio: false,
    allowsClickThrough: true,
    requiresModeration: false,
    isActive: true,
    sortOrder: 8,
  },
];

/**
 * Surfaces from earlier layouts of the room. The auditorium has one screen and
 * two products on it; anything else is switched off rather than deleted, so
 * historic campaigns, payments and AirLogs still resolve.
 */
export const RETIRED_PLACEMENT_IDS = [
  "MAIN_COMMERCIAL",
  "STUDIO_LEFT",
  "STUDIO_RIGHT",
  "MAIN_COMMERCIAL_30",
  "MAIN_COMMERCIAL_15",
  "STATION_ID_BUMPER",
  "LOWER_THIRD",
  "TICKER",
  "SPONSOR_BUG",
  "STUDIO_LEFT",
  "STUDIO_RIGHT",
  "REAR_MONITOR",
  "DESK_DISPLAY",
  "FLOATING_PANEL",
];

/**
 * House content for surfaces nobody has booked. Always badged EXAMPLE, never a
 * paid campaign: no queue entry, no AirLog, no analytics event, no revenue.
 *
 * House artwork shows how an unoccupied surface can look. It does not represent
 * paid placements, trading rankings or sponsorship.
 *
 * To put a clip or a still on a surface, drop the file in `public/placeholders/`
 * and point `mediaUrl` at `/placeholders/<file>` — same origin, so the WebGL
 * texture can read it. A hosted URL works too, as long as that host sends CORS
 * headers. Rows pinned to the same surface rotate on a clock every viewer
 * derives the same way, so the whole room sees the same one.
 *
 * Rows are keyed by `slug`: the seed inserts what is missing, refreshes what is
 * there and drops `rh-` rows it no longer ships, so this list is the whole
 * story. Shipping artwork is an edit here plus a deploy.
 */
const houseSublabel = (placementId: string) => (placementId === "AD" ? "This break is available" : "This panel is available");

/** A slot with artwork: the file fills the surface and the text names it. */
const artCard = (
  slug: string,
  label: string,
  name: string,
  placementId: string,
  file: string,
  fit: "FIT" | "FILL" = "FILL",
  clip?: { durationSec: number },
  sortOrder = 10,
): typeof schema.showcaseCreatives.$inferInsert => ({
  slug,
  placementId,
  label,
  headline: name,
  sublabel: houseSublabel(placementId),
  accent: "#69aac1",
  mediaUrl: `/placeholders/${file}`,
  mediaType: clip ? "VIDEO" : "IMAGE",
  // A clip in a break is anchored to the top of that break, so every viewer is
  // the same distance into it; that needs its real length.
  durationSec: clip?.durationSec ?? null,
  fit,
  sortOrder,
});

export const HOUSE_PLACEHOLDER_PREFIX = "rh-";

export const HOUSE_PLACEHOLDERS: Array<typeof schema.showcaseCreatives.$inferInsert> = [
  {
    slug: "airtime-buy-the-screen",
    placementId: null,
    label: "AIRTIME",
    headline: "Buy the screen",
    sublabel: "Runtime from 0.5 SOL · every fee buys Anduril pre-stock",
    accent: "#69aac1",
    sortOrder: 1,
  },
  // The break runs the promo; the panel carries the mark on its own black
  // ground, centred, so the panel and the artwork share an edge you cannot see.
  // (`anduril-panel.png` is the wordmark lifted off the wide frame and set in
  // the middle of a 9:16 field of the same black.)
  artCard("rh-anduril", "Anduril", "Anduril", "AD", "anduril-promo.mp4", "FILL", { durationSec: 74 }),
  artCard("rh-anduril-panel", "Anduril", "Anduril", "PANEL_LEFT", "anduril-panel.png", "FIT"),
  artCard("rh-dune", "Dune", "Dune Analytics", "PANEL_TOP_LEFT", "dune.jpg"),
  artCard("rh-cashcat", "$CASHCAT", "Cash Cat", "PANEL_TOP_MID", "cashcat.jpg"),
  // Pons moves across rather than off the board: the right panel was the one
  // still standing empty.
  artCard("rh-pons", "$PONS", "Pons", "PANEL_RIGHT", "pons.jpg"),
  // Cut to the shape of the surface they stand on: square for the small panel
  // at the end of the top row, portrait for the tower.
  artCard("rh-fomo", "FOMO", "Fomo", "PANEL_TOP_RIGHT", "fomo.jpg"),
  // The tower's column is far narrower than the 9:16 this was drawn for, and
  // filling it cut the sides off the mark, so this one is shown whole.
  artCard("rh-hype", "HYPE", "Hype", "PANEL_TOWER", "HYPE.jpg", "FIT"),

];

export async function ensureBaseline(): Promise<{ adminPassword: string | null }> {
  const database = db();
  const e = env();

  const existingChannels = await database.select().from(schema.channels);
  if (existingChannels.length === 0) {
    await database.insert(schema.channels).values([
      { id: "MAIN", name: "AIRTIME Main", slug: "main", description: "The main 24/7 AIRTIME feed.", isActive: true, autoFill: true, autoFillAdBreakSec: 120, sortOrder: 0 },
      { id: "MARKETS", name: "AIRTIME Markets", slug: "markets", description: "Reserved for market coverage.", isActive: false, autoFill: true, autoFillAdBreakSec: 120, sortOrder: 1 },
      { id: "MUSIC", name: "AIRTIME Music", slug: "music", description: "Reserved.", isActive: false, autoFill: true, autoFillAdBreakSec: 90, sortOrder: 2 },
      { id: "COMMUNITY", name: "AIRTIME Community", slug: "community", description: "Reserved.", isActive: false, autoFill: true, autoFillAdBreakSec: 120, sortOrder: 3 },
      { id: "AFTER_HOURS", name: "AIRTIME After Hours", slug: "after-hours", description: "Reserved.", isActive: false, autoFill: true, autoFillAdBreakSec: 120, sortOrder: 4 },
    ]);
  }

  // Insert placements that do not exist yet, by id. Adding a surface to
  // BASE_PLACEMENTS therefore ships it on the next deploy, and an operator's
  // edits to an existing surface are never overwritten.
  const existingPlacements = await database.select({ id: schema.placements.id }).from(schema.placements);
  const known = new Set(existingPlacements.map((p) => p.id));
  const missing = BASE_PLACEMENTS.filter((p) => !known.has(p.id));
  if (missing.length) {
    await database.insert(schema.placements).values(missing).onConflictDoNothing({ target: schema.placements.id });
  }

  // Switch off surfaces that no longer exist in the studio. Deactivating keeps
  // their campaigns, payments and AirLogs resolvable; deleting would not.
  const retired = existingPlacements.filter((p) => RETIRED_PLACEMENT_IDS.includes(p.id)).map((p) => p.id);
  if (retired.length) {
    await database.update(schema.placements).set({ isActive: false }).where(inArray(schema.placements.id, retired));
  }

  // House content is the station's own, not an operator's campaign, so the seed
  // stays authoritative for it: shipping a placeholder's artwork is an edit to
  // HOUSE_PLACEHOLDERS and a deploy. Only the copy and the media are refreshed —
  // whether a slot is switched on stays with whoever switched it off.
  for (const card of HOUSE_PLACEHOLDERS) {
    await database
      .insert(schema.showcaseCreatives)
      .values(card)
      .onConflictDoUpdate({
        target: schema.showcaseCreatives.slug,
        set: {
          placementId: card.placementId ?? null,
          label: card.label,
          headline: card.headline,
          sublabel: card.sublabel ?? null,
          accent: card.accent ?? "#69aac1",
          mediaUrl: card.mediaUrl ?? null,
          mediaType: card.mediaType ?? null,
          posterUrl: card.posterUrl ?? null,
          durationSec: card.durationSec ?? null,
          fit: card.fit ?? "FILL",
          sortOrder: card.sortOrder ?? 0,
        },
      });
  }
  // Drop house rows this seed used to ship and no longer does. Scoped to the
  // seed's own slug prefix, so anything an operator added is left alone.
  const shipped = HOUSE_PLACEHOLDERS.map((c) => c.slug);
  await database
    .delete(schema.showcaseCreatives)
    .where(and(like(schema.showcaseCreatives.slug, `${HOUSE_PLACEHOLDER_PREFIX}%`), notInArray(schema.showcaseCreatives.slug, shipped)));

  let adminPassword: string | null = null;
  const admins = await database.select({ id: schema.adminUsers.id }).from(schema.adminUsers);
  if (admins.length === 0) {
    let password = e.ADMIN_PASSWORD;
    if (!password) {
      if (isProduction()) throw new Error("ADMIN_PASSWORD must be set to create the initial admin in production");
      password = "airtime-dev";
    }
    adminPassword = password;
    await database.insert(schema.adminUsers).values({ email: e.ADMIN_EMAIL.toLowerCase(), passwordHash: await bcrypt.hash(password, 10), role: "OWNER" });
  }
  return { adminPassword };
}

/**
 * Public sample programming (DEV DATA). Blender Foundation open movies (CC-BY)
 * from the Internet Archive, an MDN CC0 clip and Mux's public HLS test asset.
 * All hosts serve CORS headers, which WebGL video textures require.
 */
const DEV_PROGRAMS = [
  { title: "Big Buck Bunny", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", poster: null, durationSec: 634, isPremium: true, description: "DEV DATA · Blender Foundation open movie (CC-BY) · adaptive HLS via Mux test streams." },
  { title: "Flower", url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", poster: null, durationSec: 20, isPremium: false, description: "DEV DATA · MDN CC0 sample clip (progressive MP4)." },
  { title: "Tears of Steel", url: "https://test-streams.mux.dev/tos_ismc/main.m3u8", poster: null, durationSec: 734, isPremium: true, description: "DEV DATA · Blender Foundation open movie (CC-BY) · adaptive HLS via Mux test streams." },
  { title: "Big Buck Bunny · 720p WebM", url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.720p.vp9.webm", poster: null, durationSec: 634, isPremium: false, description: "DEV DATA · Blender Foundation open movie (CC-BY) · Wikimedia Commons transcode (VP9 WebM)." },
  { title: "Mux demo reel", url: "https://stream.mux.com/VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU.m3u8", poster: null, durationSec: 630, isPremium: false, description: "DEV DATA · Mux public demo asset (HLS)." },
];

/**
 * What the picture plays when nobody has bought it.
 *
 * The station's own reel, and the only thing in rotation: the sample films this
 * ran on before are switched out rather than deleted, so their blocks, AirLogs
 * and anything that references them still resolve.
 *
 * This is house programming, not a campaign. It never displaces anything
 * anybody paid for: a bought show takes the picture the moment it is paid for,
 * a bought spot takes every break, and both are chosen ahead of the schedule in
 * `resolveMainSource`. The reel is only what is left when neither is sold.
 *
 * Runs on every boot, after the dev-data seed, so sample programming cannot
 * creep back onto the screen.
 */
const HOUSE_PICTURE = {
  title: "Anduril",
  description: "Station reel. Plays on the picture while nobody has bought the runtime.",
  mediaUrl: "/placeholders/anduril-promo.mp4",
  durationSec: 74,
};

export async function ensureHousePicture(channelId = "MAIN"): Promise<boolean> {
  const database = db();

  const [existing] = await database
    .select()
    .from(schema.programs)
    .where(and(eq(schema.programs.channelId, channelId), eq(schema.programs.mediaUrl, HOUSE_PICTURE.mediaUrl)));

  let reel = existing;
  if (!reel) {
    [reel] = await database
      .insert(schema.programs)
      .values({
        channelId,
        title: HOUSE_PICTURE.title,
        description: HOUSE_PICTURE.description,
        mediaType: "VOD",
        mediaUrl: HOUSE_PICTURE.mediaUrl,
        posterUrl: null,
        durationSec: HOUSE_PICTURE.durationSec,
        isPremium: false,
        inRotation: true,
        isDevData: false,
      })
      .returning();
  } else if (!reel.inRotation) {
    await database.update(schema.programs).set({ inRotation: true }).where(eq(schema.programs.id, reel.id));
  }

  const retired = await database
    .update(schema.programs)
    .set({ inRotation: false })
    .where(and(eq(schema.programs.channelId, channelId), eq(schema.programs.inRotation, true), ne(schema.programs.id, reel.id)))
    .returning({ id: schema.programs.id });

  const changed = !existing || !existing.inRotation || retired.length > 0;
  if (changed) {
    // The schedule ahead was written from the old rotation. Drop what has not
    // started yet — never the block on air, which would cut the picture
    // mid-frame — and let the horizon rebuild from the reel.
    await database
      .delete(schema.programBlocks)
      .where(and(eq(schema.programBlocks.channelId, channelId), eq(schema.programBlocks.isManual, false), gt(schema.programBlocks.startsAt, serverNow())));
  }
  return changed;
}

export async function seedDevData(): Promise<boolean> {
  if (!devDataAllowed()) return false;
  const database = db();
  const existing = await database.select({ id: schema.programs.id }).from(schema.programs).where(eq(schema.programs.channelId, "MAIN"));
  if (existing.length > 0) return false;

  await database.insert(schema.programs).values(
    DEV_PROGRAMS.map((p) => ({
      channelId: "MAIN",
      title: p.title,
      description: p.description,
      mediaType: "VOD" as const,
      mediaUrl: p.url,
      posterUrl: p.poster,
      durationSec: p.durationSec,
      isPremium: p.isPremium,
      inRotation: true,
      isDevData: true,
    })),
  );
  await database.insert(schema.liveSources).values({
    channelId: "MAIN",
    name: "DEV DATA · Mux HLS test stream",
    hlsUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    isActive: true,
  });
  await ensureScheduleHorizon("MAIN", 12);
  return true;
}
