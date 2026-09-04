"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStation, type StationMode } from "@/lib/store";
import { useSurfaces } from "./surfaceRegistry";

interface Props {
  reducedMotion: boolean;
  mobile: boolean;
  mode: StationMode;
}

const WATCH_POS = new THREE.Vector3(0, 3.5, 14.2);
const WATCH_TARGET = new THREE.Vector3(0, 2.85, -4.5);
const BROWSE_POS = new THREE.Vector3(0, 4.2, 17.2);
const BROWSE_TARGET = new THREE.Vector3(0, 2.9, -4);
const MOBILE_POS = new THREE.Vector3(0, 3.0, 13.5);
const MOBILE_TARGET = new THREE.Vector3(0, 3.3, -5);
const SETTLE_FROM = new THREE.Vector3(0, 4.1, 16.6);

/**
 * <CameraRig> – the only thing that moves the camera.
 *  - 1.6 s settle-in on load
 *  - subtle pointer parallax while watching
 *  - damped dolly toward a focused surface, framed left of the HUD panel
 *  - widens in browse mode
 *  - reduced-motion: no parallax, near-instant transitions
 */
export function CameraRig({ reducedMotion, mobile, mode }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const focused = useStation((s) => s.focusedPlacementId);
  const surfaces = useSurfaces((s) => s.byName);
  const placementMesh = useStation((s) => s.focusedPlacementId);
  const pos = useRef(SETTLE_FROM.clone());
  const target = useRef(WATCH_TARGET.clone());
  const pointer = useRef({ x: 0, y: 0 });
  const started = useRef(performance.now());

  useEffect(() => {
    camera.position.copy(SETTLE_FROM);
    camera.lookAt(WATCH_TARGET);
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [camera]);

  // Map focused placement id → surface (mesh-backed surfaces are registered by mesh name).
  const focusSurface = useMemo(() => {
    if (!focused) return null;
    const direct = surfaces[focused];
    if (direct) return direct;
    return null;
  }, [focused, surfaces, placementMesh]);

  const focusMeshName = useStation((s) => s.focusedPlacementId);
  const meshNameById = useSurfaceLookup();

  useFrame((_, dt) => {
    const aspect = size.width / Math.max(1, size.height);
    let desiredPos: THREE.Vector3;
    let desiredTarget: THREE.Vector3;

    const surface = focusSurface ?? (focusMeshName ? surfaces[meshNameById.get(focusMeshName) ?? ""] : undefined) ?? null;

    if (focused && surface) {
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
      // The glass panel covers the right of the viewport on desktop, so the surface
      // is framed inside the free area to its left rather than the whole screen.
      const panelPx = mobile ? 0 : Math.min(440, size.width * 0.48);
      const freeFraction = (size.width - panelPx) / size.width;
      const distW = surface.width / 2 / Math.tan(hFov / 2) / (freeFraction * 0.74);
      const distH = surface.height / 2 / Math.tan(vFov / 2) / (mobile ? 0.5 : 0.62);
      const dist = Math.max(distH, distW, 1.6);
      // Aim to the right of the surface so the surface itself lands left of the panel.
      const lateral = mobile ? 0 : dist * Math.tan(hFov / 2) * (panelPx / size.width);
      desiredTarget = surface.center.clone().add(surface.right.clone().multiplyScalar(lateral)).add(surface.up.clone().multiplyScalar(mobile ? surface.height * 0.35 : 0));
      desiredPos = surface.center.clone().add(surface.normal.clone().multiplyScalar(dist)).add(surface.right.clone().multiplyScalar(lateral)).add(new THREE.Vector3(0, mobile ? -0.2 : 0.15, 0));
      // Never go below the floor or through the back wall.
      desiredPos.y = Math.max(0.8, desiredPos.y);
    } else if (mode === "browse") {
      desiredPos = (mobile ? MOBILE_POS : BROWSE_POS).clone();
      desiredTarget = (mobile ? MOBILE_TARGET : BROWSE_TARGET).clone();
    } else {
      desiredPos = (mobile ? MOBILE_POS : WATCH_POS).clone();
      desiredTarget = (mobile ? MOBILE_TARGET : WATCH_TARGET).clone();
      if (!reducedMotion && !mobile) {
        desiredPos.x += pointer.current.x * 0.35;
        desiredPos.y += -pointer.current.y * 0.18;
      }
    }

    const elapsed = (performance.now() - started.current) / 1000;
    const settling = elapsed < 1.8 && !focused && mode === "watch";
    const lambda = reducedMotion ? 30 : settling ? 1.6 : focused ? 3.2 : 2.4;
    pos.current.x = THREE.MathUtils.damp(pos.current.x, desiredPos.x, lambda, dt);
    pos.current.y = THREE.MathUtils.damp(pos.current.y, desiredPos.y, lambda, dt);
    pos.current.z = THREE.MathUtils.damp(pos.current.z, desiredPos.z, lambda, dt);
    target.current.x = THREE.MathUtils.damp(target.current.x, desiredTarget.x, lambda, dt);
    target.current.y = THREE.MathUtils.damp(target.current.y, desiredTarget.y, lambda, dt);
    target.current.z = THREE.MathUtils.damp(target.current.z, desiredTarget.z, lambda, dt);
    camera.position.copy(pos.current);
    camera.lookAt(target.current);
    const wantFov = mobile ? 62 : focused ? 38 : 48;
    if (Math.abs(camera.fov - wantFov) > 0.01) {
      camera.fov = THREE.MathUtils.damp(camera.fov, wantFov, lambda, dt);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

/** placementId → mesh name lookup fed by BroadcastStudio through the placements query cache. */
import { usePlacements } from "@/lib/hooks";
function useSurfaceLookup(): Map<string, string> {
  const { data } = usePlacements("MAIN");
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const p of data?.placements ?? []) {
      if (p.meshName) m.set(p.id, p.meshName);
      else m.set(p.id, p.id);
    }
    // Overlays live on the main screen.
    for (const p of data?.placements ?? []) if (p.type === "OVERLAY" && p.kind !== "ticker") m.set(p.id, "Screen_Main");
    return m;
  }, [data]);
}
