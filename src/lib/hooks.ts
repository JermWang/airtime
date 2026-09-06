"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type BroadcastStateDto, type QueueDto, type ActivationsDto, type PlacementDto, type BoardDto, type SurfaceDto, type SessionDto, type CampaignDto, type ShowcaseDto, type TreasuryDto } from "./api";
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

/** A per-tab id so the server can count this viewer once, across reconnects. */
function viewerId(): string {
  const KEY = "airtime.viewer";
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export function useRealtimeConnection(): void {
  const push = useRealtime((s) => s.push);
  const setConnected = useRealtime((s) => s.setConnected);
  const setViewers = useRealtime((s) => s.setViewers);
  const setOffset = useClock((s) => s.setOffset);
  const qc = useQueryClient();
  useEffect(() => {
    let es: EventSource | null = null;
    let retry = 1000;
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      es = new EventSource(`/api/events?v=${encodeURIComponent(viewerId())}`);
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
              void qc.invalidateQueries({ queryKey: ["surface"] });
              void qc.invalidateQueries({ queryKey: ["board"] });
              break;
            case "queue.updated":
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
            case "placement.activated":
            case "placement.released":
              void qc.invalidateQueries({ queryKey: ["queue"] });
              void qc.invalidateQueries({ queryKey: ["availability"] });
              void qc.invalidateQueries({ queryKey: ["placements"] });
              void qc.invalidateQueries({ queryKey: ["surface"] });
              void qc.invalidateQueries({ queryKey: ["board"] });
              void qc.invalidateQueries({ queryKey: ["activations"] });
              break;
            case "clock.updated":
              // Re-sync immediately when the dev clock moves.
              void api<{ serverTime: number }>("/api/time").then((r) => {
                if (!stopped) setOffset(r.serverTime - Date.now());
              }).catch(() => { /* periodic clock sync will retry */ });
              void qc.invalidateQueries();
              break;
            case "chat.message":
              void qc.invalidateQueries({ queryKey: ["chat"] });
              break;
            case "settings.updated":
              void qc.invalidateQueries({ queryKey: ["settings"] });
              break;
            case "viewers":
              setViewers(e.count);
              break;
            case "hello":
              if (typeof e.viewers === "number") setViewers(e.viewers);
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
  }, [push, setConnected, setOffset, setViewers, qc]);
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

/** The live ask for one surface. Polled often: the price is always moving. */
export function useSurface(placementId: string | null) {
  return useQuery({
    queryKey: ["surface", placementId],
    queryFn: () => api<SurfaceDto>(`/api/placements/${placementId}/surface`),
    enabled: Boolean(placementId),
    refetchInterval: 10_000,
  });
}

/** Every surface, its ask and its occupant. */
export function useBoard(channelId = "MAIN") {
  return useQuery({
    queryKey: ["board", channelId],
    queryFn: () => api<BoardDto>(`/api/board?channel=${channelId}`),
    refetchInterval: 15_000,
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
