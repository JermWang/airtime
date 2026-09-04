"use client";

import { create } from "zustand";

/* ------------------------------------------------------------------------- */
/*  Server clock                                                              */
/* ------------------------------------------------------------------------- */

interface ClockState {
  /** serverTime - localTime, in ms. */
  offsetMs: number;
  synced: boolean;
  setOffset: (offsetMs: number) => void;
  now: () => number;
}

export const useClock = create<ClockState>((set, get) => ({
  offsetMs: 0,
  synced: false,
  setOffset: (offsetMs) => set({ offsetMs, synced: true }),
  now: () => Date.now() + get().offsetMs,
}));

/** Server-authoritative now (ms). Safe to call outside React. */
export const serverNowMs = () => useClock.getState().now();

/* ------------------------------------------------------------------------- */
/*  Realtime                                                                  */
/* ------------------------------------------------------------------------- */

export interface RealtimeEnvelope {
  id: number;
  at: number;
  type: string;
  [key: string]: unknown;
}

interface RealtimeState {
  connected: boolean;
  /** People with the station open right now, counted by the server. */
  viewers: number;
  setViewers: (n: number) => void;
  last: RealtimeEnvelope | null;
  /** Monotonic counters per event type, used by hooks to re-fetch. */
  versions: Record<string, number>;
  setConnected: (v: boolean) => void;
  push: (e: RealtimeEnvelope) => void;
}

export const useRealtime = create<RealtimeState>((set) => ({
  connected: false,
  viewers: 0,
  setViewers: (viewers) => set({ viewers }),
  last: null,
  versions: {},
  setConnected: (connected) => set({ connected }),
  push: (e) => set((s) => ({ last: e, versions: { ...s.versions, [e.type]: (s.versions[e.type] ?? 0) + 1 } })),
}));

/* ------------------------------------------------------------------------- */
/*  Station UI                                                                */
/* ------------------------------------------------------------------------- */

const SOUND_KEY = "airtime.sound";

export type StationMode = "watch" | "browse" | "focus" | "preview";

export interface PreviewCreative {
  kind: "image" | "video" | "text";
  url?: string;
  text?: string;
  fit: "FIT" | "FILL";
}

interface StationState {
  mode: StationMode;
  /** Placement id currently focused (camera moved toward it). */
  focusedPlacementId: string | null;
  hoveredPlacementId: string | null;
  /** Placement highlighted from the queue panel. */
  highlightedPlacementId: string | null;
  /** Creative previewed on the focused placement (WYSIWYG). */
  preview: PreviewCreative | null;
  showSafeZones: boolean;
  drawer: "none" | "inventory" | "queue" | "guide" | "campaigns" | "chat";
  webglAvailable: boolean | null;
  sceneReady: boolean;
  /** The ident has cleared, so the studio is visible and the intro camera move may run. */
  introStarted: boolean;
  muted: boolean;
  /** 0..1, applied to the single station media element. */
  volume: number;
  /** The browser refused to play with sound; the UI asks for a click. */
  soundBlocked: boolean;
  setMode: (m: StationMode) => void;
  focusPlacement: (id: string | null) => void;
  hoverPlacement: (id: string | null) => void;
  highlightPlacement: (id: string | null) => void;
  setPreview: (p: PreviewCreative | null) => void;
  setShowSafeZones: (v: boolean) => void;
  setDrawer: (d: StationState["drawer"]) => void;
  setWebgl: (v: boolean) => void;
  setSceneReady: (v: boolean) => void;
  startIntro: () => void;
  setMuted: (v: boolean) => void;
  setVolume: (v: number) => void;
  setSoundBlocked: (v: boolean) => void;
  restoreSoundPreference: () => void;
  reset: () => void;
}

export const useStation = create<StationState>((set) => ({
  mode: "watch",
  focusedPlacementId: null,
  hoveredPlacementId: null,
  highlightedPlacementId: null,
  preview: null,
  showSafeZones: false,
  drawer: "none",
  webglAvailable: null,
  sceneReady: false,
  introStarted: false,
  muted: true,
  volume: 0.85,
  soundBlocked: false,
  setMode: (mode) => set({ mode }),
  focusPlacement: (focusedPlacementId) => set({ focusedPlacementId, mode: focusedPlacementId ? "focus" : "watch", preview: focusedPlacementId ? undefined : null } as Partial<StationState>),
  hoverPlacement: (hoveredPlacementId) => set({ hoveredPlacementId }),
  highlightPlacement: (highlightedPlacementId) => set({ highlightedPlacementId }),
  setPreview: (preview) => set({ preview }),
  setShowSafeZones: (showSafeZones) => set({ showSafeZones }),
  setDrawer: (drawer) => set({ drawer }),
  setWebgl: (webglAvailable) => set({ webglAvailable }),
  setSceneReady: (sceneReady) => set({ sceneReady }),
  startIntro: () => set({ introStarted: true }),
  setMuted: (muted) => {
    set({ muted, soundBlocked: muted ? false : useStation.getState().soundBlocked });
    try {
      window.localStorage.setItem(SOUND_KEY, JSON.stringify({ muted, volume: useStation.getState().volume }));
    } catch {
      /* private mode: the preference simply does not persist */
    }
  },
  setVolume: (volume) => {
    const v = Math.min(1, Math.max(0, volume));
    set({ volume: v, muted: v === 0 ? true : useStation.getState().muted });
    try {
      window.localStorage.setItem(SOUND_KEY, JSON.stringify({ muted: useStation.getState().muted, volume: v }));
    } catch {
      /* ignored */
    }
  },
  setSoundBlocked: (soundBlocked) => set({ soundBlocked }),
  /**
   * Sound starts muted on every load because browsers refuse to autoplay audio,
   * and the viewer's choice is restored after mount rather than during render so
   * the server and client agree on the first paint.
   */
  restoreSoundPreference: () => {
    try {
      const raw = window.localStorage.getItem(SOUND_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { muted?: unknown; volume?: unknown };
      set((s) => ({
        muted: typeof saved.muted === "boolean" ? saved.muted : s.muted,
        volume: typeof saved.volume === "number" ? Math.min(1, Math.max(0, saved.volume)) : s.volume,
      }));
    } catch {
      /* ignored */
    }
  },
  reset: () => set({ mode: "watch", focusedPlacementId: null, preview: null, showSafeZones: false, drawer: "none" }),
}));
