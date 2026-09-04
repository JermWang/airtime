import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "./client";
import { env, devDataAllowed, isProduction } from "../env";
import { ensureScheduleHorizon } from "../broadcast/schedule";
import type { NewPlacement, PlacementPricingRules, PlacementAvailabilityRules } from "./schema";

/**
 * Seed data.
 *
 *   ensureBaseline()  – channel, admin user, placements. Runs in every environment
 *                       when the corresponding table is empty (idempotent).
 *   seedDevData()     – sample programming (public Blender films, clearly labelled
 *                       DEV DATA). Never runs on mainnet / when disabled.
 */

const ETH = 10n ** 18n;
const milliEth = (n: number) => ((ETH * BigInt(Math.round(n * 1000))) / 1000n).toString();

const fixedPricing = (unitSeconds: number): PlacementPricingRules => ({
  mode: "FIXED",
  unitSeconds,
  durationExponentBps: 10_000,
  timeOfDay: [],
  premiumProgramMultiplierBps: 10_000,
  demand: { enabled: false, maxMultiplierBps: 10_000 },
  proximity: [],
});

const dynamicPricing = (unitSeconds: number): PlacementPricingRules => ({
  mode: "DYNAMIC",
  unitSeconds,
  durationExponentBps: 9_000, // slight volume discount
  timeOfDay: [
    { fromHourUtc: 13, toHourUtc: 21, multiplierBps: 12_500 }, // US market hours
    { fromHourUtc: 0, toHourUtc: 6, multiplierBps: 7_500 },
  ],
  premiumProgramMultiplierBps: 15_000,
  demand: { enabled: true, maxMultiplierBps: 20_000 },
  proximity: [{ withinMinutes: 30, multiplierBps: 11_000 }],
});

const continuous = (slotSeconds: number, leadTimeSec = 120, horizonHours = 48): PlacementAvailabilityRules => ({
  inventoryMode: "CONTINUOUS",
  slotSeconds,
  leadTimeSec,
  horizonHours,
  hoursUtc: null,
});

const adBreak = (slotSeconds: number): PlacementAvailabilityRules => ({
  inventoryMode: "AD_BREAK",
  slotSeconds,
  leadTimeSec: 120,
  horizonHours: 24,
  hoursUtc: null,
});

export const BASE_PLACEMENTS: NewPlacement[] = [
  {
    id: "MAIN_COMMERCIAL_30",
    channelId: "MAIN",
    name: "30-second commercial",
    description: "Full-screen spot inside a scheduled commercial break on the main broadcast.",
    type: "FULLSCREEN",
    kind: "commercial",
    aspectRatio: "16:9",
    mediaTypes: ["VIDEO", "IMAGE"],
    minDurationSec: 30,
    maxDurationSec: 30,
    durationOptionsSec: [30],
    basePriceWei: milliEth(10),
    priceMultiplierBps: 10_000,
    pricingRules: dynamicPricing(30),
    availability: adBreak(15),
    lane: "main_stream",
    ownsMainStream: true,
    meshName: "Screen_Main",
    transform: null,
    material: { emissiveIntensity: 1.4, fit: "FIT", idleKind: "house" },
    maxWidth: 1920,
    maxHeight: 1080,
    maxFileBytes: 40 * 1024 * 1024,
    allowsAudio: true,
    allowsClickThrough: false,
    requiresModeration: true,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: "MAIN_COMMERCIAL_15",
    channelId: "MAIN",
    name: "15-second commercial",
    description: "Full-screen spot inside a scheduled commercial break on the main broadcast.",
    type: "FULLSCREEN",
    kind: "commercial",
    aspectRatio: "16:9",
    mediaTypes: ["VIDEO", "IMAGE"],
    minDurationSec: 15,
    maxDurationSec: 15,
    durationOptionsSec: [15],
    basePriceWei: milliEth(6),
    priceMultiplierBps: 10_000,
    pricingRules: dynamicPricing(15),
    availability: adBreak(15),
    lane: "main_stream",
    ownsMainStream: true,
    meshName: "Screen_Main",
    transform: null,
    material: { emissiveIntensity: 1.4, fit: "FIT", idleKind: "house" },
    maxWidth: 1920,
    maxHeight: 1080,
    maxFileBytes: 25 * 1024 * 1024,
    allowsAudio: true,
    allowsClickThrough: false,
    requiresModeration: true,
    isActive: true,
    sortOrder: 2,
  },
  {
    id: "STATION_ID_BUMPER",
    channelId: "MAIN",
    name: "Station identification bumper",
    description: "Ten-second sponsored station ID that takes the whole picture at the top of a commercial break.",
    type: "SPONSORSHIP",
    kind: "station_id",
    aspectRatio: "16:9",
    mediaTypes: ["VIDEO", "IMAGE"],
    minDurationSec: 10,
    maxDurationSec: 10,
    durationOptionsSec: [10],
    basePriceWei: milliEth(8),
    priceMultiplierBps: 10_000,
    pricingRules: dynamicPricing(10),
    availability: adBreak(15),
    lane: "main_stream",
    ownsMainStream: true,
    meshName: "Screen_Main",
    transform: null,
    material: { emissiveIntensity: 1.4, fit: "FIT", idleKind: "house" },
    maxWidth: 1920,
    maxHeight: 1080,
    maxFileBytes: 20 * 1024 * 1024,
    allowsAudio: true,
    allowsClickThrough: false,
    requiresModeration: true,
    isActive: true,
    sortOrder: 3,
  },
  {
    id: "LOWER_THIRD",
    channelId: "MAIN",
    name: "Lower third",
    description: "Branded lower-third overlay on the live picture while programming continues.",
    type: "OVERLAY",
    kind: "lower_third",
    aspectRatio: "8:1",
    mediaTypes: ["IMAGE"],
    minDurationSec: 60,
    maxDurationSec: 600,
    durationOptionsSec: [60, 120, 300, 600],
    basePriceWei: milliEth(3),
    priceMultiplierBps: 10_000,
    pricingRules: dynamicPricing(300),
    availability: continuous(60),
    lane: "overlay_lower",
    meshName: null,
    transform: null,
    material: { emissiveIntensity: 1, fit: "FIT" },
    maxWidth: 1600,
    maxHeight: 200,
    maxFileBytes: 4 * 1024 * 1024,
    allowsAudio: false,
    allowsClickThrough: true,
    requiresModeration: false,
    isActive: true,
    sortOrder: 3,
  },
  {
    id: "TICKER",
    channelId: "MAIN",
    name: "Ticker",
    description: "Text message on the bottom ticker of the broadcast and the 3D LED ribbon.",
    type: "OVERLAY",
    kind: "ticker",
    aspectRatio: "32:1",
    mediaTypes: ["TEXT"],
    minDurationSec: 300,
    maxDurationSec: 3600,
    durationOptionsSec: [300, 900, 1800, 3600],
    basePriceWei: milliEth(2),
    priceMultiplierBps: 10_000,
    pricingRules: fixedPricing(300),
    availability: continuous(300),
    lane: "overlay_ticker",
    meshName: "LED_Ribbon",
    transform: null,
    material: { emissiveIntensity: 2.2, fit: "FIT" },
    maxWidth: 0,
    maxHeight: 0,
    maxFileBytes: 4096,
    allowsAudio: false,
    allowsClickThrough: false,
    requiresModeration: false,
    isActive: true,
    sortOrder: 4,
  },
  {
    id: "SPONSOR_BUG",
    channelId: "MAIN",
    name: "Sponsor bug",
    description: "Small persistent logo in the corner of the broadcast picture.",
    type: "OVERLAY",
    kind: "sponsor_bug",
    aspectRatio: "1:1",
    mediaTypes: ["LOGO", "IMAGE"],
    minDurationSec: 900,
    maxDurationSec: 7200,
    durationOptionsSec: [900, 1800, 3600, 7200],
    basePriceWei: milliEth(4),
    priceMultiplierBps: 10_000,
    pricingRules: fixedPricing(900),
    availability: continuous(300),
    lane: "overlay_bug",
    meshName: null,
    transform: null,
    material: { emissiveIntensity: 1, fit: "FIT" },
    maxWidth: 512,
    maxHeight: 512,
    maxFileBytes: 2 * 1024 * 1024,
    allowsAudio: false,
    allowsClickThrough: true,
    requiresModeration: false,
    isActive: true,
    sortOrder: 5,
  },
  {
    id: "STUDIO_LEFT",
    channelId: "MAIN",
    name: "Left studio billboard",
    description: "Large architectural billboard on the left wall of the broadcast studio.",
    type: "ENVIRONMENT",
    kind: "billboard",
    aspectRatio: "16:9",
    mediaTypes: ["IMAGE", "VIDEO"],
    minDurationSec: 300,
    maxDurationSec: 3600,
    durationOptionsSec: [300, 900, 1800, 3600],
    basePriceWei: milliEth(2),
    priceMultiplierBps: 10_000,
    pricingRules: dynamicPricing(900),
    availability: continuous(300),
    lane: "studio_left",
    meshName: "Billboard_Left",
    transform: null,
    material: { emissiveIntensity: 1.1, fit: "FILL", idleKind: "house" },
    maxWidth: 1920,
    maxHeight: 1080,
    maxFileBytes: 12 * 1024 * 1024,
    allowsAudio: false,
    allowsClickThrough: true,
    requiresModeration: false,
    isActive: true,
    sortOrder: 6,
  },
  {
    id: "STUDIO_RIGHT",
    channelId: "MAIN",
    name: "Right studio billboard",
    description: "Large architectural billboard on the right wall of the broadcast studio.",
    type: "ENVIRONMENT",
    kind: "billboard",
    aspectRatio: "16:9",
    mediaTypes: ["IMAGE", "VIDEO"],
    minDurationSec: 300,
    maxDurationSec: 3600,
    durationOptionsSec: [300, 900, 1800, 3600],
    basePriceWei: milliEth(2),
    priceMultiplierBps: 10_000,
    pricingRules: dynamicPricing(900),
    availability: continuous(300),
    lane: "studio_right",
    meshName: "Billboard_Right",
    transform: null,
    material: { emissiveIntensity: 1.1, fit: "FILL", idleKind: "house" },
    maxWidth: 1920,
    maxHeight: 1080,
    maxFileBytes: 12 * 1024 * 1024,
    allowsAudio: false,
    allowsClickThrough: true,
    requiresModeration: false,
    isActive: true,
    sortOrder: 7,
  },
  {
    id: "REAR_MONITOR",
    channelId: "MAIN",
    name: "Rear video wall",
    description: "Wide video wall behind the anchor desk.",
    type: "ENVIRONMENT",
    kind: "video_wall",
    aspectRatio: "32:9",
    mediaTypes: ["IMAGE", "VIDEO"],
    minDurationSec: 300,
    maxDurationSec: 3600,
    durationOptionsSec: [300, 900, 1800, 3600],
    basePriceWei: milliEth(1.5),
    priceMultiplierBps: 10_000,
    pricingRules: dynamicPricing(900),
    availability: continuous(300),
    lane: "rear_wall",
    meshName: "Monitor_Rear",
    transform: null,
    material: { emissiveIntensity: 0.9, fit: "FILL", idleKind: "house" },
    maxWidth: 2560,
    maxHeight: 720,
    maxFileBytes: 12 * 1024 * 1024,
    allowsAudio: false,
    allowsClickThrough: false,
    requiresModeration: false,
    isActive: true,
    sortOrder: 8,
  },
  {
    id: "DESK_DISPLAY",
    channelId: "MAIN",
    name: "Desk display",
    description: "Glass display embedded in the front of the anchor desk.",
    type: "ENVIRONMENT",
    kind: "desk_display",
    aspectRatio: "21:9",
    mediaTypes: ["IMAGE"],
    minDurationSec: 300,
    maxDurationSec: 3600,
    durationOptionsSec: [300, 900, 1800, 3600],
    basePriceWei: milliEth(1),
    priceMultiplierBps: 10_000,
    pricingRules: fixedPricing(900),
    availability: continuous(300),
    lane: "desk",
    meshName: "Desk_Display",
    transform: null,
    material: { emissiveIntensity: 0.8, fit: "FILL", idleKind: "house" },
    maxWidth: 1680,
    maxHeight: 720,
    maxFileBytes: 6 * 1024 * 1024,
    allowsAudio: false,
    allowsClickThrough: false,
    requiresModeration: false,
    isActive: true,
    sortOrder: 9,
  },
  {
    id: "FLOATING_PANEL",
    channelId: "MAIN",
    name: "Floating glass panel",
    description: "Transform-positioned glass panel hovering right of the main display (no mesh; placed by the visual editor).",
    type: "ENVIRONMENT",
    kind: "glass_panel",
    aspectRatio: "9:16",
    mediaTypes: ["IMAGE"],
    minDurationSec: 300,
    maxDurationSec: 3600,
    durationOptionsSec: [300, 900, 1800, 3600],
    basePriceWei: milliEth(1.2),
    priceMultiplierBps: 10_000,
    pricingRules: fixedPricing(900),
    availability: continuous(300),
    lane: "floating_panel",
    meshName: null,
    transform: { position: [6.2, 2.4, -3.2], rotation: [0, -0.55, 0], scale: [1.35, 2.4, 1] },
    material: { emissiveIntensity: 0.9, fit: "FILL", idleKind: "house" },
    maxWidth: 1080,
    maxHeight: 1920,
    maxFileBytes: 6 * 1024 * 1024,
    allowsAudio: false,
    allowsClickThrough: true,
    requiresModeration: false,
    isActive: true,
    sortOrder: 10,
  },
];

/**
 * House showcase cards. Text-only, procedurally drawn, always badged EXAMPLE.
 *
 * They exist so an empty network still demonstrates what the billboards do, and
 * so the treasury mechanic is visible in the room. They are never presented as
 * paid campaigns: they do not appear in the public queue and produce no AirLog.
 * Two surfaces are deliberately left bare so real availability is obvious.
 */
export const SHOWCASE_CARDS: Array<typeof schema.showcaseCreatives.$inferInsert> = [
  {
    placementId: "STUDIO_LEFT",
    label: "AIRTIME",
    headline: "Every fee buys Anduril pre-stock",
    sublabel: "Ad revenue and token tax · distributed to holders",
    accent: "#ccff00",
    sortOrder: 1,
  },
  {
    placementId: "STUDIO_RIGHT",
    label: "Example",
    headline: "Your token on the wall",
    sublabel: "Robinhood Chain assets · from 2 ETH / 15m",
    accent: "#8ecbff",
    sortOrder: 2,
  },
  {
    placementId: "REAR_MONITOR",
    label: "Example",
    headline: "Tokenized equities · trading 24/5",
    sublabel: "Placeholder card · this wall is available",
    accent: "#ffb547",
    sortOrder: 3,
  },
  {
    placementId: "DESK_DISPLAY",
    label: "Example",
    headline: "Launch day, on air",
    sublabel: "Placeholder card · desk display available",
    accent: "#c9a7ff",
    sortOrder: 4,
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

  const existingPlacements = await database.select({ id: schema.placements.id }).from(schema.placements);
  if (existingPlacements.length === 0) {
    await database.insert(schema.placements).values(BASE_PLACEMENTS);
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
