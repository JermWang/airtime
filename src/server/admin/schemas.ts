import { z } from "zod";

const bps = z.number().int().min(0).max(1_000_000);

const weiString = z.string().regex(/^\d+$/, "Amounts are integer wei");

export const auctionSchema = z.object({
  openingPriceWei: weiString,
  floorPriceWei: weiString,
  decaySeconds: z.number().int().min(60).max(30 * 24 * 3600),
  takeoverPremiumBps: z.number().int().min(10_000).max(1_000_000),
  minIncrementBps: z.number().int().min(0).max(1_000_000),
  minHoldSeconds: z.number().int().min(0).max(30 * 24 * 3600),
  maxHoldSeconds: z.number().int().min(0).max(365 * 24 * 3600).default(0),
});

export const availabilitySchema = z.object({
  inventoryMode: z.enum(["CONTINUOUS", "AD_BREAK"]),
  hoursUtc: z.object({ from: z.number().min(0).max(24), to: z.number().min(0).max(24) }).nullable().default(null),
});

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const transformSchema = z.object({ position: vec3, rotation: vec3, scale: vec3 }).nullable();

export const materialSchema = z.object({
  emissiveIntensity: z.number().min(0).max(10),
  fit: z.enum(["FIT", "FILL"]),
  idleUrl: z.string().url().optional(),
  idleKind: z.enum(["image", "video", "house"]).optional(),
});

export const placementInputSchema = z.object({
  id: z.string().regex(/^[A-Z0-9_]{3,40}$/, "Use UPPER_SNAKE_CASE"),
  channelId: z.string().min(1).max(32),
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
  type: z.enum(["FULLSCREEN", "OVERLAY", "ENVIRONMENT", "SPONSORSHIP"]),
  kind: z.string().min(1).max(40),
  aspectRatio: z.string().regex(/^\d+(\.\d+)?:\d+(\.\d+)?$/),
  mediaTypes: z.array(z.enum(["IMAGE", "VIDEO", "TEXT", "LOGO"])).min(1),
  auction: auctionSchema,
  availability: availabilitySchema,
  lane: z.string().min(1).max(40),
  ownsMainStream: z.boolean().default(false),
  meshName: z.string().max(80).nullable().optional(),
  transform: transformSchema.optional(),
  material: materialSchema,
  maxWidth: z.number().int().min(0).max(8192),
  maxHeight: z.number().int().min(0).max(8192),
  maxCreativeSec: z.number().int().min(0).max(24 * 3600).default(60),
  maxFileBytes: z.number().int().min(0).max(512 * 1024 * 1024),
  allowsAudio: z.boolean().default(false),
  allowsClickThrough: z.boolean().default(false),
  requiresModeration: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const placementPatchSchema = placementInputSchema.partial().omit({ id: true });

export const programInputSchema = z.object({
  channelId: z.string().min(1).max(32),
  title: z.string().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
  mediaType: z.enum(["VOD", "LIVE_HLS"]).default("VOD"),
  mediaUrl: z.string().url().max(2048),
  posterUrl: z.string().url().max(2048).nullable().optional(),
  durationSec: z.number().int().positive().max(24 * 3600),
  isPremium: z.boolean().default(false),
  inRotation: z.boolean().default(true),
});

export const channelInputSchema = z.object({
  id: z.string().regex(/^[A-Z0-9_]{2,32}$/),
  name: z.string().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().default(true),
  autoFill: z.boolean().default(true),
  autoFillAdBreakSec: z.number().int().min(0).max(3600).default(120),
  sortOrder: z.number().int().default(0),
});

export const manualBlockSchema = z.object({
  channelId: z.string().min(1).max(32),
  type: z.enum(["VOD", "LIVE_HLS", "AD_BREAK", "BUMPER"]),
  title: z.string().min(1).max(120),
  mediaUrl: z.string().url().max(2048).nullable().optional(),
  liveSourceId: z.string().uuid().nullable().optional(),
  durationSec: z.number().int().positive().max(24 * 3600),
  startsAt: z.string().datetime().optional(),
});
