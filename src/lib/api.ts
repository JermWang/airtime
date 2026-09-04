"use client";

import type { SignedQuoteWire } from "./chain/airtimePayments";

/* ------------------------------------------------------------------------- */
/*  DTOs (mirrors server projections)                                         */
/* ------------------------------------------------------------------------- */

export interface ProgramBlockDto {
  id: string;
  channelId: string;
  type: "VOD" | "LIVE_HLS" | "AD_BREAK" | "BUMPER";
  title: string;
  mediaUrl: string | null;
  startsAt: string;
  endsAt: string;
  durationSec: number;
  metadata: Record<string, unknown>;
  isManual: boolean;
  isDevData: boolean;
}

export interface BroadcastStateDto {
  channelId: string;
  serverTime: number;
  now: ProgramBlockDto | null;
  offsetSec: number;
  next: ProgramBlockDto | null;
  later: ProgramBlockDto[];
}

export interface CreativeDto {
  id: string;
  type: "IMAGE" | "VIDEO" | "TEXT" | "LOGO";
  status: "PENDING" | "VALID" | "INVALID" | "APPROVED" | "REJECTED";
  url: string | null;
  posterUrl: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  hasAudio: boolean;
  textContent: string | null;
  clickUrl: string | null;
  creativeHash: string;
  contentHash: string;
  validationErrors: string[];
  warnings: string[];
  createdAt: string;
}

export interface QueueEntryDto {
  id: string;
  displayName: string;
  status: string;
  placementId: string;
  placementName: string;
  placementType: "FULLSCREEN" | "OVERLAY" | "ENVIRONMENT" | "SPONSORSHIP";
  placementKind: string;
  ownsMainStream: boolean;
  startsAt: string | null;
  endsAt: string | null;
  durationSec: number | null;
  wallet: string;
  txHash: string | null;
  txUrl: string | null;
  creative: CreativeDto | null;
  fit: "FIT" | "FILL";
  clickUrl: string | null;
}

export interface QueueDto {
  serverTime: number;
  onAir: QueueEntryDto[];
  upNext: QueueEntryDto[];
  later: QueueEntryDto[];
  recent: QueueEntryDto[];
}

export interface ActivationsDto {
  serverTime: number;
  active: QueueEntryDto[];
  upcoming: QueueEntryDto[];
}

export interface PlacementDto {
  id: string;
  channelId: string;
  name: string;
  description: string | null;
  type: "FULLSCREEN" | "OVERLAY" | "ENVIRONMENT" | "SPONSORSHIP";
  kind: string;
  aspectRatio: string;
  mediaTypes: Array<"IMAGE" | "VIDEO" | "TEXT" | "LOGO">;
  minDurationSec: number;
  maxDurationSec: number;
  durationOptionsSec: number[];
  basePriceWei: string;
  priceMultiplierBps: number;
  pricingRules: {
    mode: "FIXED" | "DYNAMIC";
    unitSeconds: number;
    durationExponentBps: number;
    timeOfDay: Array<{ fromHourUtc: number; toHourUtc: number; multiplierBps: number }>;
    premiumProgramMultiplierBps: number;
    demand: { enabled: boolean; maxMultiplierBps: number };
    proximity: Array<{ withinMinutes: number; multiplierBps: number }>;
  };
  availability: { inventoryMode: "CONTINUOUS" | "AD_BREAK"; slotSeconds: number; leadTimeSec: number; horizonHours: number; hoursUtc: { from: number; to: number } | null };
  lane: string;
  ownsMainStream: boolean;
  meshName: string | null;
  transform: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] } | null;
  material: { emissiveIntensity: number; fit: "FIT" | "FILL"; idleUrl?: string; idleKind?: "image" | "video" | "house" };
  maxWidth: number;
  maxHeight: number;
  maxFileBytes: number;
  allowsAudio: boolean;
  allowsClickThrough: boolean;
  requiresModeration: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface SlotDto {
  startsAt: string;
  endsAt: string;
  status: "AVAILABLE" | "RESERVED" | "SOLD_OUT" | "UNAVAILABLE";
  blockId?: string;
  blockTitle?: string;
  context?: string;
}

export interface AvailabilityDto {
  placementId: string;
  durationSec: number;
  serverTime: number;
  from: string;
  to: string;
  slots: SlotDto[];
}

export interface PriceLineDto {
  label: string;
  multiplierBps?: number;
  amountWei: string;
}

export interface QuoteDto {
  quote: SignedQuoteWire;
  amountWei: string;
  breakdown: PriceLineDto[];
  expiresAt: string;
  startsAt: string;
  endsAt: string;
  campaignId: string;
  placementId: string;
  treasury: string | null;
}

export interface CampaignDto {
  id: string;
  displayName: string;
  status: string;
  placement: { id: string; name: string; type: PlacementDto["type"]; kind: string; aspectRatio: string; channelId: string; meshName: string | null };
  creative: CreativeDto | null;
  startsAt: string | null;
  endsAt: string | null;
  durationSec: number | null;
  fit: "FIT" | "FILL";
  clickUrl: string | null;
  wallet: string;
  payment: { txHash: string; txUrl: string | null; blockNumber: string; amountWei: string; paymentToken: string; status: string; confirmedAt: string; chainId: number } | null;
  airLogId: string | null;
  rejectionReason: string | null;
  activeQuoteId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShowcaseDto {
  id: string;
  placementId: string | null;
  label: string;
  headline: string;
  sublabel: string | null;
  accent: string;
  sortOrder: number;
  isActive: boolean;
}

export interface TreasurySummaryDto {
  allocationBps: number;
  airtimeRevenueWei: string;
  airtimePayments: number;
  taxInflowWei: string;
  totalInflowWei: string;
  earmarkedWei: string;
  deployedWei: string;
  awaitingDeploymentWei: string;
  sharesAcquired: string;
  sharesDistributed: string;
  sharesHeld: string;
  holdersReached: number;
  purchases: number;
  distributions: number;
  lastPurchaseAt: string | null;
  lastDistributionAt: string | null;
}

export interface TreasuryLedgerRowDto {
  id: string;
  kind: "TAX_INFLOW" | "STOCK_PURCHASE" | "DISTRIBUTION";
  occurredAt: string;
  amountWei: string;
  assetSymbol: string;
  shares: string;
  pricePerShareWei: string | null;
  holders: number | null;
  txHash: string | null;
  txUrl: string | null;
  reference: string | null;
  note: string | null;
  isDevData: boolean;
}

export interface TreasuryDto {
  summary: TreasurySummaryDto;
  ledger: TreasuryLedgerRowDto[];
}

export interface SessionDto {
  wallet: { address: string; chainId: number } | null;
}

/* ------------------------------------------------------------------------- */
/*  Fetch helpers                                                             */
/* ------------------------------------------------------------------------- */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers = new Headers(init?.headers);
  let body = init?.body;
  if (init?.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path, { ...init, headers, body, credentials: "same-origin", cache: "no-store" });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; details?: unknown };
    throw new ApiError(res.status, err.error ?? `Request failed (${res.status})`, err.details);
  }
  return data as T;
}
