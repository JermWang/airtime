"use client";

import { create } from "zustand";
import type { MainSource } from "./playerEngine";

/**
 * Shared player state. The single <video> element rendered by StationPlayer
 * is the source of truth for the main stream; the 3D BroadcastScreen reads it
 * from here to build a VideoTexture, so DOM and WebGL always show the same frame.
 */
interface PlayerState {
  videoEl: HTMLVideoElement | null;
  source: MainSource | null;
  /** True while media is actually progressing. */
  playing: boolean;
  /** Media failed to load / decode. */
  error: string | null;
  /** Video finished before the block ended → holding slate. */
  holding: boolean;
  driftSec: number;
  setVideoEl: (el: HTMLVideoElement | null) => void;
  setSource: (s: MainSource | null) => void;
  setPlaying: (v: boolean) => void;
  setError: (e: string | null) => void;
  setHolding: (v: boolean) => void;
  setDrift: (d: number) => void;
}

export const usePlayer = create<PlayerState>((set) => ({
  videoEl: null,
  source: null,
  playing: false,
  error: null,
  holding: false,
  driftSec: 0,
  setVideoEl: (videoEl) => set({ videoEl }),
  setSource: (source) => set({ source }),
  setPlaying: (playing) => set({ playing }),
  setError: (error) => set({ error }),
  setHolding: (holding) => set({ holding }),
  setDrift: (driftSec) => set({ driftSec }),
}));
