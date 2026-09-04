"use client";

import { create } from "zustand";

/**
 * Performance tiers. Chosen from device hints at start-up and lowered at
 * runtime by drei's PerformanceMonitor when the frame rate drops.
 *
 *   high   – DPR up to 2, reflections 1024, bloom, shadows 2048
 *   medium – DPR up to 1.5, reflections 512, bloom, shadows 1024
 *   low    – DPR 1, no reflections, no post, no shadows
 */
export type Tier = "high" | "medium" | "low";

export interface TierConfig {
  maxDpr: number;
  reflections: boolean;
  reflectionResolution: number;
  post: boolean;
  shadows: boolean;
  shadowMapSize: number;
  videoSurfaces: boolean;
  environmentResolution: number;
}

export const TIERS: Record<Tier, TierConfig> = {
  high: { maxDpr: 2, reflections: true, reflectionResolution: 1024, post: true, shadows: true, shadowMapSize: 2048, videoSurfaces: true, environmentResolution: 256 },
  medium: { maxDpr: 1.5, reflections: true, reflectionResolution: 512, post: true, shadows: true, shadowMapSize: 1024, videoSurfaces: true, environmentResolution: 128 },
  low: { maxDpr: 1, reflections: false, reflectionResolution: 256, post: false, shadows: false, shadowMapSize: 512, videoSurfaces: false, environmentResolution: 64 },
};

interface PerfState {
  tier: Tier;
  locked: boolean;
  setTier: (t: Tier) => void;
  degrade: () => void;
}

export const usePerf = create<PerfState>((set, get) => ({
  tier: "high",
  locked: false,
  setTier: (tier) => set({ tier }),
  degrade: () => {
    const t = get().tier;
    if (t === "high") set({ tier: "medium" });
    else if (t === "medium") set({ tier: "low" });
  },
}));

export function detectInitialTier(): Tier {
  if (typeof navigator === "undefined") return "medium";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;
  const mobile = /Android|iPhone|iPad|iPod/i.test(nav.userAgent) || window.matchMedia("(max-width: 767px)").matches;
  const saveData = (nav as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (saveData) return "low";
  if (mobile) return cores >= 6 && mem >= 4 ? "medium" : "low";
  if (cores <= 4 || mem <= 4) return "medium";
  return "high";
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
