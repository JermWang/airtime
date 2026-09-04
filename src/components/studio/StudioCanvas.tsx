"use client";

import { Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor, AdaptiveDpr, Environment, Lightformer, Preload } from "@react-three/drei";
import * as THREE from "three";
import { BroadcastStudio } from "./BroadcastStudio";
import { CameraRig } from "./CameraRig";
import { EnvironmentalLights } from "./EnvironmentalLights";
import { Effects } from "./Effects";
import { usePerf, TIERS, detectInitialTier } from "./perf";
import { useStation } from "@/lib/store";
import { usePrefersReducedMotion, useIsMobile } from "@/lib/hooks";

/**
 * The WebGL studio. Lazy-loaded by StationShell so television playback and
 * the HUD never wait for it.
 */
export function StudioCanvas({ channelId = "MAIN" }: { channelId?: string }) {
  const tier = usePerf((s) => s.tier);
  const setTier = usePerf((s) => s.setTier);
  const degrade = usePerf((s) => s.degrade);
  const cfg = TIERS[tier];
  const reduced = usePrefersReducedMotion();
  const mobile = useIsMobile();
  const setSceneReady = useStation((s) => s.setSceneReady);
  const mode = useStation((s) => s.mode);

  useEffect(() => {
    setTier(detectInitialTier());
  }, [setTier]);

  const gl = useMemo(
    () => ({
      antialias: tier !== "low",
      powerPreference: "high-performance" as const,
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1.05,
      outputColorSpace: THREE.SRGBColorSpace,
      alpha: false,
      stencil: false,
    }),
    [tier],
  );

  return (
    <Canvas
      dpr={[1, cfg.maxDpr]}
      gl={gl}
      shadows={cfg.shadows ? { type: THREE.PCFSoftShadowMap } : false}
      camera={{ fov: mobile ? 58 : 42, near: 0.1, far: 120, position: [0, 3.6, 6.2] }}
      frameloop="always"
      className="!fixed inset-0"
      style={{ background: "#050607" }}
      onCreated={({ gl: renderer }) => {
        renderer.setClearColor("#050607", 1);
      }}
      eventSource={typeof document !== "undefined" ? document.body : undefined}
      eventPrefix="client"
    >
      <color attach="background" args={["#050607"]} />
      <fog attach="fog" args={["#060709", 22, 58]} />
      <PerformanceMonitor onDecline={() => degrade()} flipflops={2} factor={0.5} />
      {tier !== "low" && <AdaptiveDpr pixelated={false} />}
      <Suspense fallback={null}>
        <Environment resolution={cfg.environmentResolution} frames={1}>
          <Lightformer intensity={2.2} form="rect" color="#dfe7ee" position={[0, 8, -6]} scale={[14, 1.2, 1]} target={[0, 3, -6]} />
          <Lightformer intensity={1.2} form="rect" color="#c9d3dc" position={[0, 8, 2]} scale={[14, 1.2, 1]} target={[0, 3, 0]} />
          <Lightformer intensity={0.5} form="rect" color="#ccff00" position={[-14, 6, -2]} scale={[1, 12, 1]} rotation={[0, Math.PI / 2, 0]} />
          <Lightformer intensity={0.5} form="rect" color="#ccff00" position={[14, 6, -2]} scale={[1, 12, 1]} rotation={[0, -Math.PI / 2, 0]} />
        </Environment>
        <EnvironmentalLights tier={tier} />
        <BroadcastStudio channelId={channelId} onReady={() => setSceneReady(true)} />
        <CameraRig reducedMotion={reduced} mobile={mobile} mode={mode} />
        {cfg.post && <Effects />}
        <Preload all />
      </Suspense>
    </Canvas>
  );
}
