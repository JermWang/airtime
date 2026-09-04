"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type PlacementDto, type ProgramBlockDto, type CampaignDto, type BroadcastStateDto } from "@/lib/api";

export interface OverviewDto {
  serverTime: number;
  simulatedOffsetMs: number;
  settings: { purchasesPaused: boolean; clockOffsetMs: number; quoteHoldSeconds: number; defaultChannelId: string; treasuryAllocationBps: number };
  chain: { id: number; name: string; contract: string | null; contractUrl: string | null; quoteSigner: string };
  channels: BroadcastStateDto[];
  counts: { queued: number; airing: number; awaiting: number; completed: number; pendingModeration: number };
  revenue: { totalWei: string; payments: number };
  failedActivations: Array<{ id: string; campaignId: string; placementId: string; scheduledStart: string; failureReason: string | null; status: string }>;
}

export interface ProgramDto {
  id: string;
  channelId: string;
  title: string;
  description: string | null;
  mediaType: "VOD" | "LIVE_HLS";
  mediaUrl: string;
  posterUrl: string | null;
  durationSec: number;
  isPremium: boolean;
  inRotation: boolean;
  isDevData: boolean;
}

export interface LiveSourceDto {
  id: string;
  channelId: string;
  name: string;
  hlsUrl: string;
  isActive: boolean;
}

export interface ChannelDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  autoFill: boolean;
  autoFillAdBreakSec: number;
  sortOrder: number;
}

export const useOverview = () => useQuery({ queryKey: ["admin", "overview"], queryFn: () => api<OverviewDto>("/api/admin/overview"), refetchInterval: 5000 });
export const useAdminChannels = () => useQuery({ queryKey: ["admin", "channels"], queryFn: () => api<{ channels: ChannelDto[] }>("/api/admin/channels") });
export const useAdminPrograms = () => useQuery({ queryKey: ["admin", "programs"], queryFn: () => api<{ programs: ProgramDto[] }>("/api/admin/programs") });
export const useLiveSources = () => useQuery({ queryKey: ["admin", "live-sources"], queryFn: () => api<{ liveSources: LiveSourceDto[] }>("/api/admin/live-sources") });
export const useAdminSchedule = (channel = "MAIN", hours = 12) => useQuery({ queryKey: ["admin", "schedule", channel, hours], queryFn: () => api<{ serverTime: number; blocks: ProgramBlockDto[] }>(`/api/admin/schedule?channel=${channel}&hours=${hours}`), refetchInterval: 10_000 });
export const useAdminPlacements = () => useQuery({ queryKey: ["admin", "placements"], queryFn: () => api<{ placements: PlacementDto[] }>("/api/admin/placements") });
export const useAdminCreatives = (status = "VALID") => useQuery({ queryKey: ["admin", "creatives", status], queryFn: () => api<{ creatives: Array<Record<string, unknown> & { id: string; type: string; status: string; url: string | null; posterUrl: string | null; textContent: string | null; wallet: string; placementId: string | null; createdAt: string; validationErrors: string[]; originalFilename: string | null; width: number | null; height: number | null; durationSec: number | null }> }>(`/api/admin/creatives?status=${status}`) });
export const useAdminCampaigns = (status = "ACTIVE") => useQuery({ queryKey: ["admin", "campaigns", status], queryFn: () => api<{ campaigns: CampaignDto[] }>(`/api/admin/campaigns?status=${status}`), refetchInterval: 8000 });
export const useAdminPayments = () => useQuery({ queryKey: ["admin", "payments"], queryFn: () => api<{ payments: Array<{ id: string; campaignId: string; campaignName: string; placementId: string; quoteId: string; txHash: string; txUrl: string | null; blockNumber: string; buyer: string; paymentToken: string; amountWei: string; status: string; confirmedAt: string; chainId: number }> }>("/api/admin/payments") });
export const useAdminSettings = () => useQuery({ queryKey: ["admin", "settings"], queryFn: () => api<{ settings: OverviewDto["settings"]; simulationClockAllowed: boolean }>("/api/admin/settings") });
export const useAuditLog = () => useQuery({ queryKey: ["admin", "audit"], queryFn: () => api<{ logs: Array<{ id: string; actorType: string; actorId: string | null; action: string; targetType: string | null; targetId: string | null; details: Record<string, unknown>; createdAt: string }> }>("/api/admin/audit?limit=200"), refetchInterval: 10_000 });

/** Generic admin mutation that invalidates the admin cache. */
export function useAdminMutation<TInput, TOut = unknown>(fn: (input: TInput) => Promise<TOut>, invalidate: string[][] = [["admin"]]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));
      await qc.invalidateQueries({ queryKey: ["placements"] });
      await qc.invalidateQueries({ queryKey: ["broadcast"] });
      await qc.invalidateQueries({ queryKey: ["guide"] });
    },
  });
}
