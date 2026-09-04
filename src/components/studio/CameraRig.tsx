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

const WATCH_POS = new THREE.Vector3(0, 6.1, 8.6);
const WATCH_TARGET = new THREE.Vector3(0, 6.25, -5.2);
const BROWSE_POS = new THREE.Vector3(0, 6.3, 12.4);
const BROWSE_TARGET = new THREE.Vector3(0, 6.3, -5.2);
const MOBILE_POS = new THREE.Vector3(0, 6.2, 12.6);
const MOBILE_TARGET = new THREE.Vector3(0, 6.4, -5.2);

/* ---- opening move ------------------------------------------------------- */
/* A dolly out: the shot opens tight on the main picture from inside the set,
 * then pulls back through the room, rising and widening until the whole studio
 * is revealed at the resting watch pose. The path is authored rather than
 * damped, so the move lands on exactly the frame the station then holds. */
const SCREEN_CENTRE = new THREE.Vector3(0, 6.4, -5.2);
const INTRO_FROM = new THREE.Vector3(0.9, 5.6, -0.4);
const INTRO_MID = new THREE.Vector3(1.8, 5.9, 3.8);
const MOBILE_INTRO_FROM = new THREE.Vector3(0.5, 5.9, 1.2);
const MOBILE_INTRO_MID = new THREE.Vector3(0.9, 6.05, 6.4);
const INTRO_SEC = 3.8;
const MOBILE_INTRO_SEC = 2.9;
const INTRO_FOV = 31;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * <CameraRig> - the only thing that moves the camera.
 *  - a scripted dolly out from the main picture on first load
 *  - subtle pointer parallax while watching
 *  - damped dolly toward a focused surface, framed left of the HUD panel
 *  - widens in browse mode
 *  - reduced-motion: no intro, no parallax, near-instant transitions
 */
export function CameraRig({ reducedMotion, mobile, mode }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const focused = useStation((s) => s.focusedPlacementId);
  const surfaces = useSurfaces((s) => s.byName);
  const introStarted = useStation((s) => s.introStarted);
  const placementMesh = useStation((s) => s.focusedPlacementId);
  const pos = useRef(INTRO_FROM.clone());
  const target = useRef(SCREEN_CENTRE.clone());
  const pointer = useRef({ x: 0, y: 0 });
  const intro = useRef({ startedAt: 0, done: false });

  const introFrom = mobile ? MOBILE_INTRO_FROM : INTRO_FROM;
  const introPath = useMemo(() => {
    const from = mobile ? MOBILE_INTRO_FROM : INTRO_FROM;
    const mid = mobile ? MOBILE_INTRO_MID : INTRO_MID;
    const to = mobile ? MOBILE_POS : WATCH_POS;
    return new THREE.CatmullRomCurve3([from, mid, to], false, "catmullrom", 0.5);
  }, [mobile]);

  useEffect(() => {
    // Park on the opening frame until the ident lifts; nothing moves before then.
    if (reducedMotion) {
      intro.current.done = true;
      pos.current.copy(mobile ? MOBILE_POS : WATCH_POS);
      target.current.copy(mobile ? MOBILE_TARGET : WATCH_TARGET);
    } else if (!intro.current.done) {
      pos.current.copy(introFrom);
      target.current.copy(SCREEN_CENTRE);
    }
    camera.position.copy(pos.current);
    camera.lookAt(target.current);
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [camera, introFrom, mobile, reducedMotion]);

  useEffect(() => {
    if (introStarted && !intro.current.startedAt) intro.current.startedAt = performance.now();
  }, [introStarted]);

  // Map focused placement id to a surface (mesh-backed surfaces are registered by mesh name).
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

    /* ---- opening move --------------------------------------------------- */
    // Any deliberate interaction (clicking a surface, opening browse) cuts the
    // move short rather than fighting it.
    if (!intro.current.done && (focused || mode !== "watch")) intro.current.done = true;
    if (!intro.current.done) {
      if (!intro.current.startedAt) {
        camera.position.copy(pos.current);
        camera.lookAt(target.current);
        if (Math.abs(camera.fov - INTRO_FOV) > 0.01) {
          camera.fov = INTRO_FOV;
          camera.updateProjectionMatrix();
        }
        return;
      }
      const dur = mobile ? MOBILE_INTRO_SEC : INTRO_SEC;
      const p = THREE.MathUtils.clamp((performance.now() - intro.current.startedAt) / 1000 / dur, 0, 1);
      introPath.getPoint(easeInOutCubic(p), pos.current);
      // The look-at trails the dolly, so the picture stays framed while the room
      // opens up behind it instead of the horizon swinging.
      const look = easeOutCubic(THREE.MathUtils.clamp((p - 0.12) / 0.88, 0, 1));
      target.current.lerpVectors(SCREEN_CENTRE, mobile ? MOBILE_TARGET : WATCH_TARGET, look);
      camera.position.copy(pos.current);
      camera.lookAt(target.current);
      // Widening off a long lens amplifies the pull-back.
      camera.fov = THREE.MathUtils.lerp(INTRO_FOV, restFov(aspect, mobile, false), easeOutCubic(p));
      camera.updateProjectionMatrix();
      if (p >= 1) intro.current.done = true;
      return;
    }

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

    const lambda = reducedMotion ? 30 : focused ? 3.2 : 2.4;
    pos.current.x = THREE.MathUtils.damp(pos.current.x, desiredPos.x, lambda, dt);
    pos.current.y = THREE.MathUtils.damp(pos.current.y, desiredPos.y, lambda, dt);
    pos.current.z = THREE.MathUtils.damp(pos.current.z, desiredPos.z, lambda, dt);
    target.current.x = THREE.MathUtils.damp(target.current.x, desiredTarget.x, lambda, dt);
    target.current.y = THREE.MathUtils.damp(target.current.y, desiredTarget.y, lambda, dt);
    target.current.z = THREE.MathUtils.damp(target.current.z, desiredTarget.z, lambda, dt);
    camera.position.copy(pos.current);
    camera.lookAt(target.current);
    const wantFov = restFov(aspect, mobile, Boolean(focused));
    if (Math.abs(camera.fov - wantFov) > 0.01) {
      camera.fov = THREE.MathUtils.damp(camera.fov, wantFov, lambda, dt);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

/**
 * Keeps the room's horizontal coverage constant across viewport shapes, so the
 * wing billboards stay in frame on narrow windows instead of being cut off.
 * Vertical FOV is derived from a fixed horizontal one and clamped.
 */
function restFov(aspect: number, mobile: boolean, focused: boolean): number {
  const horizontalFov = THREE.MathUtils.degToRad(mobile ? 66 : focused ? 50 : 64);
  const derived = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(horizontalFov / 2) / aspect));
  return THREE.MathUtils.clamp(derived, focused ? 32 : 38, mobile ? 74 : 62);
}

/** placementId to mesh name lookup fed by BroadcastStudio through the placements query cache. */
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
