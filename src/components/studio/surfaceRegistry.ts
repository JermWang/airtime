"use client";

import { create } from "zustand";
import * as THREE from "three";

/**
 * Registry of display surfaces in the loaded studio. BroadcastStudio fills it
 * from GLTF node names/extras; transform-based placements register their own
 * planes. The camera rig, highlight and label logic read from it.
 */
export interface SurfaceInfo {
  name: string;
  mesh: THREE.Mesh;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  width: number;
  height: number;
  isMonitor: boolean;
}

interface SurfaceState {
  byName: Record<string, SurfaceInfo>;
  register: (info: SurfaceInfo) => void;
  unregister: (name: string) => void;
}

export const useSurfaces = create<SurfaceState>((set) => ({
  byName: {},
  register: (info) => set((s) => ({ byName: { ...s.byName, [info.name]: info } })),
  unregister: (name) =>
    set((s) => {
      const next = { ...s.byName };
      delete next[name];
      return { byName: next };
    }),
}));

export function describeSurface(mesh: THREE.Mesh, isMonitor = false): SurfaceInfo {
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3().subVectors(box.max, box.min);
  const worldScale = new THREE.Vector3();
  mesh.getWorldScale(worldScale);
  const center = new THREE.Vector3();
  box.getCenter(center);
  mesh.localToWorld(center);
  const q = new THREE.Quaternion();
  mesh.getWorldQuaternion(q);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize();
  return { name: mesh.name, mesh, center, normal, up, right, width: size.x * worldScale.x, height: size.y * worldScale.y, isMonitor };
}
