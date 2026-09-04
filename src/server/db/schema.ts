import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  numeric,
  bigint,
  uuid,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* -------------------------------------------------------------------------- */
/*  Enums                                                                     */
/* -------------------------------------------------------------------------- */

export const programBlockType = pgEnum("program_block_type", ["VOD", "LIVE_HLS", "AD_BREAK", "BUMPER"]);
export const mediaType = pgEnum("media_type", ["VOD", "LIVE_HLS"]);
export const placementType = pgEnum("placement_type", ["FULLSCREEN", "OVERLAY", "ENVIRONMENT", "SPONSORSHIP"]);
export const creativeType = pgEnum("creative_type", ["IMAGE", "VIDEO", "TEXT", "LOGO"]);
export const creativeStatus = pgEnum("creative_status", [
  "PENDING",
  "VALID",
  "INVALID",
  "APPROVED",
  "REJECTED",
]);
export const campaignStatus = pgEnum("campaign_status", [
  "DRAFT",
  "VALIDATING",
  "READY_TO_PURCHASE",
  "AWAITING_PAYMENT",
  "PAID",
  "QUEUED",
  "AIRING",
  "COMPLETED",
  "REJECTED",
  "REFUNDED",
  "CANCELLED",
]);
export const quoteStatus = pgEnum("quote_status", ["ACTIVE", "EXPIRED", "CONSUMED", "CANCELLED"]);
export const reservationStatus = pgEnum("reservation_status", ["HELD", "CONFIRMED", "RELEASED"]);
export const paymentStatus = pgEnum("payment_status", ["PENDING", "CONFIRMED", "FAILED", "REFUNDED"]);
export const activationStatus = pgEnum("activation_status", ["SCHEDULED", "ACTIVE", "ENDED", "FAILED"]);
export const actorType = pgEnum("actor_type", ["ADMIN", "SYSTEM", "WALLET"]);
export const adminRole = pgEnum("admin_role", ["OWNER", "OPERATOR", "MODERATOR"]);
export const treasuryEntryKind = pgEnum("treasury_entry_kind", ["TAX_INFLOW", "STOCK_PURCHASE", "DISTRIBUTION"]);

/* -------------------------------------------------------------------------- */
/*  Identity                                                                  */
/* -------------------------------------------------------------------------- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wallets = pgTable("wallets", {
  address: text("address").primaryKey(), // lowercase 0x…
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  lastChainId: integer("last_chain_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authNonces = pgTable("auth_nonces", {
  nonce: text("nonce").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: adminRole("role").notNull().default("OPERATOR"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

/* -------------------------------------------------------------------------- */
/*  Television                                                                */
/* -------------------------------------------------------------------------- */

export const channels = pgTable("channels", {
  id: text("id").primaryKey(), // MAIN, MARKETS …
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  /** Automatically extend the schedule from the program library. */
  autoFill: boolean("auto_fill").notNull().default(true),
  /** Seconds of ad break inserted between auto-filled programs. */
  autoFillAdBreakSec: integer("auto_fill_ad_break_sec").notNull().default(120),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const programs = pgTable("programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: text("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  mediaType: mediaType("media_type").notNull().default("VOD"),
  mediaUrl: text("media_url").notNull(),
  posterUrl: text("poster_url"),
  durationSec: integer("duration_sec").notNull(),
  isPremium: boolean("is_premium").notNull().default(false),
  /** Included in the auto-fill rotation. */
  inRotation: boolean("in_rotation").notNull().default(true),
  isDevData: boolean("is_dev_data").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const liveSources = pgTable("live_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: text("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  hlsUrl: text("hls_url").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const programBlocks = pgTable(
  "program_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    programId: uuid("program_id").references(() => programs.id, { onDelete: "set null" }),
    liveSourceId: uuid("live_source_id").references(() => liveSources.id, { onDelete: "set null" }),
    type: programBlockType("type").notNull(),
    title: text("title").notNull(),
    mediaUrl: text("media_url"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    durationSec: integer("duration_sec").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    isDevData: boolean("is_dev_data").notNull().default(false),
    /** Manually inserted by an operator (emergency / interrupt). */
    isManual: boolean("is_manual").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("program_blocks_channel_start_idx").on(t.channelId, t.startsAt)],
);

/* -------------------------------------------------------------------------- */
/*  Advertising inventory                                                     */
/* -------------------------------------------------------------------------- */

export interface PlacementTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface PlacementMaterial {
  /** Emissive intensity of the screen surface in the 3D scene. */
  emissiveIntensity: number;
  /** Default fit mode for creatives. */
  fit: "FIT" | "FILL";
  /** Idle/house content shown when nothing is booked. */
  idleUrl?: string;
  idleKind?: "image" | "video" | "house";
}

export interface PlacementPricingRules {
  mode: "FIXED" | "DYNAMIC";
  /** Duration in seconds that basePriceWei buys. */
  unitSeconds: number;
  /** Multiplier applied to (duration/unit); 1 = linear. Basis points (10000 = 1.0). */
  durationExponentBps: number;
  timeOfDay: Array<{ fromHourUtc: number; toHourUtc: number; multiplierBps: number }>;
  premiumProgramMultiplierBps: number;
  demand: { enabled: boolean; maxMultiplierBps: number };
  proximity: Array<{ withinMinutes: number; multiplierBps: number }>;
}

export interface PlacementAvailabilityRules {
  /** CONTINUOUS = any slot on the grid; AD_BREAK = only inside AD_BREAK blocks. */
  inventoryMode: "CONTINUOUS" | "AD_BREAK";
  /** Slot grid in seconds. */
  slotSeconds: number;
  /** Minimum seconds between now and the earliest bookable slot. */
  leadTimeSec: number;
  /** How far ahead the inventory is sold, in hours. */
  horizonHours: number;
  /** Optional daily window (UTC hours). */
  hoursUtc?: { from: number; to: number } | null;
}

export const placements = pgTable("placements", {
  id: text("id").primaryKey(), // STUDIO_LEFT …
  channelId: text("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  type: placementType("type").notNull(),
  /** Free-form sub kind: billboard, lower_third, ticker, sponsor_bug, commercial … */
  kind: text("kind").notNull(),
  aspectRatio: text("aspect_ratio").notNull().default("16:9"),
  mediaTypes: jsonb("media_types").$type<Array<"IMAGE" | "VIDEO" | "TEXT" | "LOGO">>().notNull().default(["IMAGE"]),
  minDurationSec: integer("min_duration_sec").notNull(),
  maxDurationSec: integer("max_duration_sec").notNull(),
  durationOptionsSec: jsonb("duration_options_sec").$type<number[]>().notNull().default([]),
  basePriceWei: numeric("base_price_wei", { precision: 78, scale: 0 }).notNull(),
  priceMultiplierBps: integer("price_multiplier_bps").notNull().default(10000),
  pricingRules: jsonb("pricing_rules").$type<PlacementPricingRules>().notNull(),
  availability: jsonb("availability").$type<PlacementAvailabilityRules>().notNull(),
  /** Reservations in the same lane are mutually exclusive. */
  lane: text("lane").notNull(),
  /**
   * When true, an airing campaign on this placement takes over the main
   * broadcast picture (commercials, channel takeovers, station-ID bumpers).
   * Data, not a hardcoded placement type.
   */
  ownsMainStream: boolean("owns_main_stream").notNull().default(false),
  meshName: text("mesh_name"),
  transform: jsonb("transform").$type<PlacementTransform | null>(),
  material: jsonb("material").$type<PlacementMaterial>().notNull(),
  maxWidth: integer("max_width").notNull().default(1920),
  maxHeight: integer("max_height").notNull().default(1080),
  maxFileBytes: integer("max_file_bytes").notNull().default(8 * 1024 * 1024),
  allowsAudio: boolean("allows_audio").notNull().default(false),
  allowsClickThrough: boolean("allows_click_through").notNull().default(false),
  requiresModeration: boolean("requires_moderation").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const creatives = pgTable(
  "creatives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletAddress: text("wallet_address").notNull(),
    type: creativeType("type").notNull(),
    status: creativeStatus("status").notNull().default("PENDING"),
    originalFilename: text("original_filename"),
    storageKey: text("storage_key"),
    url: text("url"),
    posterUrl: text("poster_url"),
    mimeType: text("mime_type"),
    extension: text("extension"),
    sizeBytes: integer("size_bytes"),
    width: integer("width"),
    height: integer("height"),
    durationSec: numeric("duration_sec", { precision: 10, scale: 3 }),
    hasAudio: boolean("has_audio").notNull().default(false),
    codec: text("codec"),
    /** sha256 hex of the stored bytes. */
    contentHash: text("content_hash").notNull(),
    /** keccak256 (bytes32 hex) of the stored bytes – the on-chain creativeHash. */
    creativeHash: text("creative_hash").notNull(),
    textContent: text("text_content"),
    clickUrl: text("click_url"),
    validationErrors: jsonb("validation_errors").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    moderationNote: text("moderation_note"),
    isDevData: boolean("is_dev_data").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("creatives_wallet_idx").on(t.walletAddress)],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletAddress: text("wallet_address").notNull(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    placementId: text("placement_id")
      .notNull()
      .references(() => placements.id),
    creativeId: uuid("creative_id").references(() => creatives.id),
    displayName: text("display_name").notNull(),
    status: campaignStatus("status").notNull().default("DRAFT"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    durationSec: integer("duration_sec"),
    fit: text("fit").$type<"FIT" | "FILL">().notNull().default("FIT"),
    clickUrl: text("click_url"),
    activeQuoteId: text("active_quote_id"),
    paymentId: uuid("payment_id"),
    rejectionReason: text("rejection_reason"),
    isDevData: boolean("is_dev_data").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaigns_status_start_idx").on(t.status, t.startsAt),
    index("campaigns_wallet_idx").on(t.walletAddress),
    index("campaigns_placement_idx").on(t.placementId),
  ],
);

export interface PriceBreakdownLine {
  label: string;
  /** Multiplier in basis points, if this line is a multiplier. */
  multiplierBps?: number;
  /** Running amount in wei after this line. */
  amountWei: string;
}

export const quotes = pgTable(
  "quotes",
  {
    id: text("id").primaryKey(), // bytes32 hex
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    walletAddress: text("wallet_address").notNull(),
    placementId: text("placement_id").notNull(),
    placementIdHash: text("placement_id_hash").notNull(),
    creativeHash: text("creative_hash").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    paymentToken: text("payment_token").notNull(),
    amountWei: numeric("amount_wei", { precision: 78, scale: 0 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    nonce: numeric("nonce", { precision: 78, scale: 0 }).notNull(),
    chainId: integer("chain_id").notNull(),
    contractAddress: text("contract_address").notNull(),
    signature: text("signature").notNull(),
    priceBreakdown: jsonb("price_breakdown").$type<PriceBreakdownLine[]>().notNull().default([]),
    status: quoteStatus("status").notNull().default("ACTIVE"),
    /** Chain block height when the quote was issued (payment watcher lower bound). */
    issuedAtBlock: bigint("issued_at_block", { mode: "bigint" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("quotes_status_expires_idx").on(t.status, t.expiresAt)],
);

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placementId: text("placement_id")
      .notNull()
      .references(() => placements.id),
    lane: text("lane").notNull(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    quoteId: text("quote_id"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: reservationStatus("status").notNull().default("HELD"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reservations_lane_window_idx").on(t.lane, t.status, t.startsAt, t.endsAt)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    quoteId: text("quote_id").notNull(),
    chainId: integer("chain_id").notNull(),
    txHash: text("tx_hash").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    logIndex: integer("log_index").notNull(),
    buyer: text("buyer").notNull(),
    paymentToken: text("payment_token").notNull(),
    amountWei: numeric("amount_wei", { precision: 78, scale: 0 }).notNull(),
    status: paymentStatus("status").notNull().default("CONFIRMED"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
    refundNote: text("refund_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payments_quote_unique").on(t.quoteId), uniqueIndex("payments_tx_log_unique").on(t.txHash, t.logIndex)],
);

export const adActivations = pgTable(
  "ad_activations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    placementId: text("placement_id").notNull(),
    channelId: text("channel_id").notNull(),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    status: activationStatus("status").notNull().default("SCHEDULED"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ad_activations_status_idx").on(t.status, t.scheduledStart)],
);

export interface AirLogAnalytics {
  sessionsPresent: number;
  uniqueSessionsApprox: number;
  creativeLoadSuccess: number;
  creativeLoadFailure: number;
  visibilitySamples: number;
  visibleSamples: number;
  videoCompletions: number;
  clicks: number;
}

export const airLogs = pgTable("air_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .unique()
    .references(() => campaigns.id),
  creativeId: uuid("creative_id"),
  placementId: text("placement_id").notNull(),
  channelId: text("channel_id").notNull(),
  scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
  scheduledEnd: timestamp("scheduled_end", { withTimezone: true }).notNull(),
  actualStart: timestamp("actual_start", { withTimezone: true }),
  actualEnd: timestamp("actual_end", { withTimezone: true }),
  txHash: text("tx_hash"),
  blockNumber: bigint("block_number", { mode: "bigint" }),
  chainId: integer("chain_id"),
  walletAddress: text("wallet_address").notNull(),
  amountWei: numeric("amount_wei", { precision: 78, scale: 0 }),
  paymentToken: text("payment_token"),
  playbackStatus: text("playback_status").notNull(), // DELIVERED | PARTIAL | FAILED | UNKNOWN
  analytics: jsonb("analytics").$type<AirLogAnalytics>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Privacy-conscious first-party delivery analytics (no PII, hashed sessions). */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activationId: uuid("activation_id").references(() => adActivations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull(),
    placementId: text("placement_id").notNull(),
    sessionHash: text("session_hash").notNull(),
    type: text("type").notNull(), // present | visible | load_ok | load_fail | video_complete | click
    value: integer("value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("analytics_campaign_idx").on(t.campaignId, t.type)],
);

/* -------------------------------------------------------------------------- */
/*  Treasury                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Operator-recorded treasury ledger.
 *
 * Airtime revenue is never stored here – it is derived from confirmed payments,
 * which are themselves verified against on-chain events. This table records the
 * things the chain cannot tell us on its own: token-tax inflows, purchases of
 * Anduril pre-stock made through a broker, and distributions to holders.
 *
 * Every row is entered by a named admin and shown publicly as a recorded figure,
 * with an optional transaction or reference so it can be checked.
 */
export const treasuryEntries = pgTable(
  "treasury_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: treasuryEntryKind("kind").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    /** Value moved, in wei of `assetSymbol`. Inflows and purchase costs. */
    amountWei: numeric("amount_wei", { precision: 78, scale: 0 }).notNull().default("0"),
    assetSymbol: text("asset_symbol").notNull().default("ETH"),
    /** Pre-stock quantity: positive on a purchase, positive on a distribution (moving out). */
    shares: numeric("shares", { precision: 30, scale: 6 }).notNull().default("0"),
    /** Optional recorded price per share, in wei of `assetSymbol`. */
    pricePerShareWei: numeric("price_per_share_wei", { precision: 78, scale: 0 }),
    /** Holders reached by a distribution. */
    holders: integer("holders"),
    txHash: text("tx_hash"),
    reference: text("reference"),
    note: text("note"),
    createdBy: text("created_by"),
    isDevData: boolean("is_dev_data").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("treasury_entries_kind_idx").on(t.kind, t.occurredAt)],
);

/* -------------------------------------------------------------------------- */
/*  Showcase                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * House "showcase" cards drawn on surfaces nobody has booked, so the studio
 * demonstrates what the network looks like in use. These are procedurally drawn
 * from text only – no third-party artwork – and always carry an EXAMPLE badge so
 * they can never be mistaken for a paid campaign. They never enter the public
 * broadcast queue and never produce an AirLog.
 */
export const showcaseCreatives = pgTable("showcase_creatives", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Optional: pin this card to one placement. Null = usable on any free surface. */
  placementId: text("placement_id").references(() => placements.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  headline: text("headline").notNull(),
  sublabel: text("sublabel"),
  accent: text("accent").notNull().default("#ccff00"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  isDevData: boolean("is_dev_data").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Operations                                                                */
/* -------------------------------------------------------------------------- */

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorType: actorType("actor_type").notNull(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Uploaded original media, tracked separately from creatives for cleanup. */
export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  storageKey: text("storage_key").notNull().unique(),
  url: text("url").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Relations                                                                 */
/* -------------------------------------------------------------------------- */

export const channelsRelations = relations(channels, ({ many }) => ({
  programs: many(programs),
  blocks: many(programBlocks),
  placements: many(placements),
}));

export const programBlocksRelations = relations(programBlocks, ({ one }) => ({
  channel: one(channels, { fields: [programBlocks.channelId], references: [channels.id] }),
  program: one(programs, { fields: [programBlocks.programId], references: [programs.id] }),
  liveSource: one(liveSources, { fields: [programBlocks.liveSourceId], references: [liveSources.id] }),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  placement: one(placements, { fields: [campaigns.placementId], references: [placements.id] }),
  creative: one(creatives, { fields: [campaigns.creativeId], references: [creatives.id] }),
  channel: one(channels, { fields: [campaigns.channelId], references: [channels.id] }),
  quotes: many(quotes),
  reservations: many(reservations),
  payments: many(payments),
  airLog: one(airLogs, { fields: [campaigns.id], references: [airLogs.campaignId] }),
}));

export const quotesRelations = relations(quotes, ({ one }) => ({
  campaign: one(campaigns, { fields: [quotes.campaignId], references: [campaigns.id] }),
}));

export const reservationsRelations = relations(reservations, ({ one }) => ({
  campaign: one(campaigns, { fields: [reservations.campaignId], references: [campaigns.id] }),
  placement: one(placements, { fields: [reservations.placementId], references: [placements.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  campaign: one(campaigns, { fields: [payments.campaignId], references: [campaigns.id] }),
}));

export const airLogsRelations = relations(airLogs, ({ one }) => ({
  campaign: one(campaigns, { fields: [airLogs.campaignId], references: [campaigns.id] }),
  creative: one(creatives, { fields: [airLogs.creativeId], references: [creatives.id] }),
  placement: one(placements, { fields: [airLogs.placementId], references: [placements.id] }),
}));

export const placementsRelations = relations(placements, ({ one, many }) => ({
  channel: one(channels, { fields: [placements.channelId], references: [channels.id] }),
  campaigns: many(campaigns),
}));

export const creativesRelations = relations(creatives, ({ many }) => ({
  campaigns: many(campaigns),
}));

export const adActivationsRelations = relations(adActivations, ({ one }) => ({
  campaign: one(campaigns, { fields: [adActivations.campaignId], references: [campaigns.id] }),
}));

// Keep `sql` imported for consumers that build raw expressions from the schema module.
export { sql };

export type Channel = typeof channels.$inferSelect;
export type Program = typeof programs.$inferSelect;
export type ProgramBlock = typeof programBlocks.$inferSelect;
export type LiveSource = typeof liveSources.$inferSelect;
export type Placement = typeof placements.$inferSelect;
export type NewPlacement = typeof placements.$inferInsert;
export type Creative = typeof creatives.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type AdActivation = typeof adActivations.$inferSelect;
export type AirLog = typeof airLogs.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type TreasuryEntry = typeof treasuryEntries.$inferSelect;
export type ShowcaseCreative = typeof showcaseCreatives.$inferSelect;
export type CampaignStatus = Campaign["status"];
