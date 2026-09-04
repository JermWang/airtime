"use client";

import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { usePlacements, useActivations, useShowcase } from "@/lib/hooks";
import { useStation } from "@/lib/store";
import { useSurfaces, describeSurface } from "./surfaceRegistry";
import { BroadcastScreen } from "./BroadcastScreen";
import { BillboardSurface } from "./BillboardSurface";
import { ReflectionSurface } from "./ReflectionSurface";
import { marbleMaterial, wallMaterial, machinedMaterial, ceilingMaterial } from "./materials";
import { usePerf, TIERS } from "./perf";
import type { PlacementDto, QueueEntryDto, ShowcaseDto } from "@/lib/api";

export const STUDIO_MODEL = "/models/studio.glb";

/**
 * The auditorium: a room, and the picture in it.
 *
 * The GLTF ships geometry and a `role` on each mesh; the materials are built
 * here at runtime so the marble, the brushed panelling and the machined bezels
 * are real PBR surfaces rather than flat colours. Three meshes are sellable:
 * the picture, which carries the show and the commercial break, and the two
 * display panels either side of it, which carry spots.
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

  // Dress the scene. Idempotent: it re-runs whenever the performance tier moves.
  useEffect(() => {
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const data = obj.userData as { __baseMaterial?: THREE.Material };
      data.__baseMaterial ??= obj.material as THREE.Material;
      const base = data.__baseMaterial as THREE.MeshStandardMaterial;
      const extras = (obj.userData ?? {}) as { role?: string; surface?: boolean; intensity?: number };
      obj.castShadow = cfg.shadows && !extras.surface && extras.role !== "light";
      obj.receiveShadow = cfg.shadows;

      switch (extras.role) {
        case "floor":
          // The planar reflector replaces the floor outright when it is on.
          obj.visible = !cfg.reflections;
          if (!cfg.reflections) obj.material = marbleMaterial();
          break;
        case "wall":
          obj.material = wallMaterial();
          break;
        case "ceiling":
          obj.material = ceilingMaterial();
          break;
        case "metal":
          obj.material = machinedMaterial();
          break;
        case "light":
          // Emissive fixture: readable as a light source, under the bloom threshold.
          obj.material = new THREE.MeshBasicMaterial({ color: base.emissive.clone().multiplyScalar(0.95), toneMapped: false });
          break;
        default:
          if (extras.surface) {
            if (obj.material === base) obj.material = new THREE.MeshStandardMaterial({ color: "#050506", roughness: 0.28, metalness: 0.02 });
            register(describeSurface(obj, false));
          } else {
            base.envMapIntensity = 1.3;
            obj.material = base;
          }
      }
    });
    onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, cfg.reflections, cfg.shadows]);

  const placements = useMemo(() => (placementsData?.placements ?? []).filter((p) => p.isActive), [placementsData]);
  const surfaces = useSurfaces((s) => s.byName);
  const screenPlacements = useMemo<PlacementDto[]>(() => placements.filter((p) => p.ownsMainStream), [placements]);
  const panelPlacements = useMemo<PlacementDto[]>(() => placements.filter((p) => !p.ownsMainStream && Boolean(p.meshName)), [placements]);
  const active = useMemo<QueueEntryDto[]>(() => activations?.active ?? [], [activations]);
  const activeByPlacement = useMemo(() => {
    const m = new Map<string, QueueEntryDto>();
    for (const e of active) m.set(e.placementId, e);
    return m;
  }, [active]);
  const showcaseByPlacement = useMemo(() => {
    const m = new Map<string, ShowcaseDto>();
    for (const c of showcaseData?.showcase ?? []) if (c.placementId) m.set(c.placementId, c);
    return m;
  }, [showcaseData]);

  return (
    <group>
      <primitive object={scene} />
      {cfg.reflections && <ReflectionSurface resolution={cfg.reflectionResolution} />}
      {surfaces.Screen_Main && <BroadcastScreen surface={surfaces.Screen_Main} placements={screenPlacements} active={active} mainPlacement={screenPlacements[0] ?? null} />}

      {/* Spot panels either side of the picture. */}
      {panelPlacements.map((p) => (
        <BillboardSurface
          key={p.id}
          placement={p}
          surface={p.meshName ? surfaces[p.meshName] ?? null : null}
          campaign={activeByPlacement.get(p.id) ?? null}
          preview={focused === p.id ? preview : null}
          allowVideo={cfg.videoSurfaces}
          showcase={showcaseByPlacement.get(p.id) ?? null}
        />
      ))}
    </group>
  );
}

useGLTF.preload(STUDIO_MODEL);
