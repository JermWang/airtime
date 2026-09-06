import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "./client";
import { env, devDataAllowed, isProduction } from "../env";
import { ensureScheduleHorizon } from "../broadcast/schedule";
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

const ETH = 10n ** 18n;
const continuous = (hoursUtc: { from: number; to: number } | null = null): PlacementAvailabilityRules => ({ inventoryMode: "CONTINUOUS", hoursUtc });
const adBreak = (): PlacementAvailabilityRules => ({ inventoryMode: "AD_BREAK", hoursUtc: null });

/** ETH as a decimal with three places, returned as integer wei. eth(2.5) = 2.5 ETH. */
const eth = (n: number) => ((ETH * BigInt(Math.round(n * 1000))) / 1000n).toString();

/**
 * A configured price, never below the station minimum. Defaults to it, which is
 * what every placement here opens at.
 */
const startingPrice = (n?: number) => {
  const wei = n === undefined ? MIN_PRICE_WEI : BigInt(eth(n));
  return (wei > MIN_PRICE_WEI ? wei : MIN_PRICE_WEI).toString();
};

/**
 * Auction rules.
 *
 * Everything opens at 0.01 ETH and stays there until somebody buys it. A sale
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
 * House showcase cards. Text-only, procedurally drawn, always badged EXAMPLE.
 *
 * They exist so an empty network still demonstrates what the billboards do, and
 * so the treasury mechanic is visible in the room. They are never presented as
 * paid campaigns: they do not appear in the public queue and produce no AirLog.
 */
export const SHOWCASE_CARDS: Array<typeof schema.showcaseCreatives.$inferInsert> = [
  {
    placementId: "PANEL_LEFT",
    label: "AIRTIME",
    headline: "Buy the screen",
    sublabel: "Runtime from 0.01 ETH · every fee buys Anduril pre-stock",
    accent: "#ccff00",
    sortOrder: 1,
  },
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

  const existingShowcase = await database.select({ id: schema.showcaseCreatives.id }).from(schema.showcaseCreatives);
  if (existingShowcase.length === 0) {
    await database.insert(schema.showcaseCreatives).values(SHOWCASE_CARDS);
  }

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
