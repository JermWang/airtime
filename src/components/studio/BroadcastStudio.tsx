"use client";

import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { usePlacements, useActivations, useShowcase } from "@/lib/hooks";
import { useStation } from "@/lib/store";
import { useSurfaces, describeSurface } from "./surfaceRegistry";
import { BillboardSurface } from "./BillboardSurface";
import { BroadcastScreen } from "./BroadcastScreen";
import { BroadcastTicker3D } from "./BroadcastTicker3D";
import { StudioMonitor } from "./StudioMonitor";
import { ReflectionSurface } from "./ReflectionSurface";
import { usePerf, TIERS } from "./perf";
import type { PlacementDto, QueueEntryDto, ShowcaseDto } from "@/lib/api";

export const STUDIO_MODEL = "/models/studio.glb";

/**
 * Loads the studio GLTF, dresses named meshes (glass, coves, lamps, floor) and
 * mounts one BillboardSurface per active placement. Placements are data: a
 * placement created in the control room with meshName "Monitor_CR_2" lights
 * up here without any code change.
 */
export function BroadcastStudio({ channelId = "MAIN", onReady }: { channelId?: string; onReady?: () => void }) {
  const { scene } = useGLTF(STUDIO_MODEL);
  const register = useSurfaces((s) => s.register);
  const tier = usePerf((s) => s.tier);
  const cfg = TIERS[tier];
  const { data: placementsData } = usePlacements(channelId);
  const { data: activations } = useActivations(channelId);
  const { data: showcaseData } = useShowcase();
  const focused = useStation((s) => s.focusedPlacementId);
  const preview = useStation((s) => s.preview);

  // Dress the scene once.
  useEffect(() => {
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      // Idempotent: always derive from the material the GLTF shipped with.
      const data = obj.userData as { __baseMaterial?: THREE.Material };
      data.__baseMaterial ??= obj.material as THREE.Material;
      const mat = data.__baseMaterial as THREE.MeshStandardMaterial;
      const extras = (obj.userData ?? {}) as { role?: string; surface?: boolean; monitor?: boolean; intensity?: number };
      obj.castShadow = cfg.shadows && !extras.surface && extras.role !== "light";
      obj.receiveShadow = cfg.shadows;
      if (extras.role === "floor") {
        obj.visible = !cfg.reflections; // reflector takes over when enabled
        if (!cfg.reflections) {
          mat.roughness = 0.35;
          mat.metalness = 0.5;
          mat.envMapIntensity = 0.8;
        }
      } else if (extras.role === "light" || extras.role === "lamp" || extras.role === "accent") {
        // Emissive fixtures: bright enough to read as light sources, below the bloom
        // threshold so the ceiling never blows out.
        const gain = extras.role === "accent" ? 1.9 : extras.role === "lamp" ? 1.15 : 0.78;
        const color = mat.emissive.clone().multiplyScalar(gain);
        obj.material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
      } else if (extras.role === "glass" || mat.name === "Glass") {
        obj.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color("#9fb3bf"),
          metalness: 0,
          roughness: 0.06,
          transmission: 0.92,
          thickness: 0.4,
          ior: 1.45,
          transparent: true,
          opacity: 0.9,
          envMapIntensity: 1.2,
          clearcoat: 1,
          side: THREE.DoubleSide,
        });
        obj.castShadow = false;
      } else if (extras.surface) {
        // Default black screen material until a surface component takes ownership.
        if (obj.material === mat) obj.material = new THREE.MeshStandardMaterial({ color: "#050506", roughness: 0.3, metalness: 0.05, emissive: "#000000" });
        register(describeSurface(obj, Boolean(extras.monitor)));
      } else {
        mat.envMapIntensity = 1.5;
        obj.material = mat;
      }
    });
    onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, cfg.reflections, cfg.shadows]);

  const placements = useMemo(() => (placementsData?.placements ?? []).filter((p) => p.isActive), [placementsData]);
  const byMesh = useMemo(() => {
    const m = new Map<string, PlacementDto>();
    for (const p of placements) if (p.meshName) m.set(p.meshName, p);
    return m;
  }, [placements]);
  const activeByPlacement = useMemo(() => {
    const m = new Map<string, QueueEntryDto>();
    for (const e of activations?.active ?? []) m.set(e.placementId, e);
    return m;
  }, [activations]);

  const showcaseByPlacement = useMemo(() => {
    const m = new Map<string, ShowcaseDto>();
    for (const c of showcaseData?.showcase ?? []) if (c.placementId) m.set(c.placementId, c);
    return m;
  }, [showcaseData]);

  const surfaces = useSurfaces((s) => s.byName);
  const mainPlacements = placements.filter((p) => p.type === "FULLSCREEN");
  const environmentPlacements = placements.filter((p) => p.type === "ENVIRONMENT");
  const tickerPlacement = placements.find((p) => p.kind === "ticker") ?? null;
  const unmappedMonitors = Object.values(surfaces).filter((s) => s.isMonitor && !byMesh.has(s.name));

  return (
    <group>
      <primitive object={scene} />
      {cfg.reflections && <ReflectionSurface resolution={cfg.reflectionResolution} />}

      {/* Main broadcast display – mirrors the station player, hosts overlay planes */}
      {surfaces.Screen_Main && <BroadcastScreen surface={surfaces.Screen_Main} placements={placements.filter((p) => p.type === "OVERLAY" || p.type === "FULLSCREEN")} active={activations?.active ?? []} mainPlacement={mainPlacements[0] ?? null} />}

      {/* LED ribbon ticker */}
      {surfaces.LED_Ribbon && <BroadcastTicker3D surface={surfaces.LED_Ribbon} placement={tickerPlacement} campaign={tickerPlacement ? activeByPlacement.get(tickerPlacement.id) ?? null : null} preview={tickerPlacement && focused === tickerPlacement.id ? preview : null} />}

      {/* Data-driven studio surfaces (mesh-backed and transform-backed) */}
      {environmentPlacements.map((p) => (
        <BillboardSurface key={p.id} placement={p} surface={p.meshName ? surfaces[p.meshName] ?? null : null} campaign={activeByPlacement.get(p.id) ?? null} preview={focused === p.id ? preview : null} allowVideo={cfg.videoSurfaces} showcase={showcaseByPlacement.get(p.id) ?? null} />
      ))}

      {/* Monitors nobody has mapped inventory to show the station feed / house graphics */}
      {unmappedMonitors.map((s, i) => (
        <StudioMonitor key={s.name} surface={s} variant={i % 3 === 0 ? "feed" : "house"} />
      ))}
    </group>
  );
}

useGLTF.preload(STUDIO_MODEL);
