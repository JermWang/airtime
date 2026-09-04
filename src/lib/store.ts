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
  last: RealtimeEnvelope | null;
  /** Monotonic counters per event type, used by hooks to re-fetch. */
  versions: Record<string, number>;
  setConnected: (v: boolean) => void;
  push: (e: RealtimeEnvelope) => void;
}

export const useRealtime = create<RealtimeState>((set) => ({
  connected: false,
  last: null,
  versions: {},
  setConnected: (connected) => set({ connected }),
  push: (e) => set((s) => ({ last: e, versions: { ...s.versions, [e.type]: (s.versions[e.type] ?? 0) + 1 } })),
}));

/* ------------------------------------------------------------------------- */
/*  Station UI                                                                */
/* ------------------------------------------------------------------------- */

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
  drawer: "none" | "inventory" | "queue" | "guide" | "campaigns";
  webglAvailable: boolean | null;
  sceneReady: boolean;
  muted: boolean;
  setMode: (m: StationMode) => void;
  focusPlacement: (id: string | null) => void;
  hoverPlacement: (id: string | null) => void;
  highlightPlacement: (id: string | null) => void;
  setPreview: (p: PreviewCreative | null) => void;
  setShowSafeZones: (v: boolean) => void;
  setDrawer: (d: StationState["drawer"]) => void;
  setWebgl: (v: boolean) => void;
  setSceneReady: (v: boolean) => void;
  setMuted: (v: boolean) => void;
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
  muted: true,
  setMode: (mode) => set({ mode }),
  focusPlacement: (focusedPlacementId) => set({ focusedPlacementId, mode: focusedPlacementId ? "focus" : "watch", preview: focusedPlacementId ? undefined : null } as Partial<StationState>),
  hoverPlacement: (hoveredPlacementId) => set({ hoveredPlacementId }),
  highlightPlacement: (highlightedPlacementId) => set({ highlightedPlacementId }),
  setPreview: (preview) => set({ preview }),
  setShowSafeZones: (showSafeZones) => set({ showSafeZones }),
  setDrawer: (drawer) => set({ drawer }),
  setWebgl: (webglAvailable) => set({ webglAvailable }),
  setSceneReady: (sceneReady) => set({ sceneReady }),
  setMuted: (muted) => set({ muted }),
  reset: () => set({ mode: "watch", focusedPlacementId: null, preview: null, showSafeZones: false, drawer: "none" }),
}));
