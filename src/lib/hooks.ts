"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type BroadcastStateDto, type QueueDto, type ActivationsDto, type PlacementDto, type AvailabilityDto, type SessionDto, type CampaignDto, type ShowcaseDto, type TreasuryDto } from "./api";
import { useClock, useRealtime } from "./store";

/* ------------------------------------------------------------------------- */
/*  Server clock sync                                                         */
/* ------------------------------------------------------------------------- */

/** Round-trip clock sync; keeps the best (lowest-latency) sample. */
export function useServerClockSync(): void {
  const setOffset = useClock((s) => s.setOffset);
  useEffect(() => {
    let cancelled = false;
    let best = Number.POSITIVE_INFINITY;
    async function sample() {
      const t0 = Date.now();
      try {
        const res = await api<{ serverTime: number }>("/api/time");
        const t1 = Date.now();
        const rtt = t1 - t0;
        if (cancelled) return;
        if (rtt < best) {
          best = rtt;
          setOffset(res.serverTime + rtt / 2 - t1);
        }
      } catch {
        /* keep previous offset */
      }
    }
    void sample();
    const quick = setTimeout(sample, 1500);
    const timer = setInterval(() => {
      best = Math.min(best * 1.5, 2000); // allow re-sync over time
      void sample();
    }, 30_000);
    return () => {
      cancelled = true;
      clearTimeout(quick);
      clearInterval(timer);
    };
  }, [setOffset]);
}

/** Ticking server time (ms) at ~4Hz for UI clocks. */
export function useServerNow(intervalMs = 250): number {
  const now = useClock((s) => s.now);
  const [value, setValue] = useState(() => now());
  useEffect(() => {
    const t = setInterval(() => setValue(now()), intervalMs);
    return () => clearInterval(t);
  }, [now, intervalMs]);
  return value;
}

/* ------------------------------------------------------------------------- */
/*  Realtime (SSE)                                                            */
/* ------------------------------------------------------------------------- */

export function useRealtimeConnection(): void {
  const push = useRealtime((s) => s.push);
  const setConnected = useRealtime((s) => s.setConnected);
  const setOffset = useClock((s) => s.setOffset);
  const qc = useQueryClient();
  useEffect(() => {
    let es: EventSource | null = null;
    let retry = 1000;
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      es = new EventSource("/api/events");
      es.onopen = () => {
        retry = 1000;
        setConnected(true);
      };
      es.onmessage = (ev) => {
        try {
          const e = JSON.parse(ev.data);
          push(e);
          switch (e.type) {
            case "program.changed":
            case "schedule.updated":
              void qc.invalidateQueries({ queryKey: ["broadcast"] });
              void qc.invalidateQueries({ queryKey: ["guide"] });
              void qc.invalidateQueries({ queryKey: ["availability"] });
              break;
            case "queue.updated":
            case "placement.activated":
            case "placement.released":
              void qc.invalidateQueries({ queryKey: ["queue"] });
              void qc.invalidateQueries({ queryKey: ["activations"] });
              void qc.invalidateQueries({ queryKey: ["availability"] });
              break;
            case "campaign.updated":
            case "payment.confirmed":
              void qc.invalidateQueries({ queryKey: ["campaign", e.campaignId] });
              void qc.invalidateQueries({ queryKey: ["campaigns"] });
              void qc.invalidateQueries({ queryKey: ["availability"] });
              break;
            case "placement.updated":
            case "placements.updated":
              void qc.invalidateQueries({ queryKey: ["placements"] });
              break;
            case "clock.updated":
              // Re-sync immediately when the dev clock moves.
              void api<{ serverTime: number }>("/api/time").then((r) => setOffset(r.serverTime - Date.now()));
              void qc.invalidateQueries();
              break;
            case "settings.updated":
              void qc.invalidateQueries({ queryKey: ["settings"] });
              break;
          }
        } catch {
          /* ignore malformed */
        }
      };
      es.onerror = () => {
        setConnected(false);
        es?.close();
        es = null;
        setTimeout(connect, retry);
        retry = Math.min(retry * 2, 15_000);
      };
    };
    connect();
    return () => {
      stopped = true;
      es?.close();
    };
  }, [push, setConnected, setOffset, qc]);
}

/* ------------------------------------------------------------------------- */
/*  Data hooks                                                                */
/* ------------------------------------------------------------------------- */

export function useBroadcastState(channelId = "MAIN") {
  return useQuery({
    queryKey: ["broadcast", channelId],
    queryFn: () => api<BroadcastStateDto>(`/api/broadcast/state?channel=${channelId}`),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

export function useGuide(channelId = "MAIN", hours = 6) {
  return useQuery({
    queryKey: ["guide", channelId, hours],
    queryFn: () => api<{ serverTime: number; blocks: BroadcastStateDto["later"] }>(`/api/broadcast/guide?channel=${channelId}&hours=${hours}`),
    refetchInterval: 60_000,
  });
}

export function useQueue(channelId = "MAIN") {
  return useQuery({
    queryKey: ["queue", channelId],
    queryFn: () => api<QueueDto>(`/api/queue?channel=${channelId}`),
    refetchInterval: 20_000,
  });
}

export function useActivations(channelId = "MAIN") {
  return useQuery({
    queryKey: ["activations", channelId],
    queryFn: () => api<ActivationsDto>(`/api/activations?channel=${channelId}`),
    refetchInterval: 15_000,
  });
}

export function usePlacements(channelId = "MAIN") {
  return useQuery({
    queryKey: ["placements", channelId],
    queryFn: () => api<{ placements: PlacementDto[] }>(`/api/placements?channel=${channelId}`),
    staleTime: 60_000,
  });
}

export function useAvailability(placementId: string | null, durationSec: number | null, hours = 24) {
  return useQuery({
    queryKey: ["availability", placementId, durationSec, hours],
    queryFn: () => api<AvailabilityDto>(`/api/placements/${placementId}/availability?duration=${durationSec}&hours=${hours}`),
    enabled: Boolean(placementId && durationSec),
    refetchInterval: 20_000,
  });
}

export function useShowcase() {
  return useQuery({
    queryKey: ["showcase"],
    queryFn: () => api<{ showcase: ShowcaseDto[] }>("/api/showcase"),
    staleTime: 120_000,
  });
}

export function useTreasury() {
  return useQuery({
    queryKey: ["treasury"],
    queryFn: () => api<TreasuryDto>("/api/treasury"),
    refetchInterval: 30_000,
  });
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => api<SessionDto>("/api/auth/session"),
    staleTime: 30_000,
  });
}

export function useCampaign(id: string | null) {
  return useQuery({
    queryKey: ["campaign", id],
    queryFn: () => api<CampaignDto>(`/api/campaigns/${id}`),
    enabled: Boolean(id),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "AWAITING_PAYMENT" || s === "PAID" ? 3000 : 15_000;
    },
  });
}

export function useMyCampaigns(enabled: boolean) {
  return useQuery({
    queryKey: ["campaigns", "mine"],
    queryFn: () => api<{ campaigns: CampaignDto[] }>("/api/campaigns"),
    enabled,
  });
}

/* ------------------------------------------------------------------------- */
/*  Misc                                                                      */
/* ------------------------------------------------------------------------- */

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function useIsMobile(breakpoint = 768): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return mobile;
}

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}
