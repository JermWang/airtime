"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

interface Props {
  mesh: THREE.Mesh;
  enabled: boolean;
  onOver?: () => void;
  onOut?: () => void;
  onClick?: () => void;
}

/**
 * Makes a GLTF mesh clickable **without touching the loaded scene graph**.
 *
 * A proxy mesh shares the target's geometry and follows its world matrix. It
 * writes no colour and no depth, so it is invisible, but stays `visible` so the
 * raycaster still hits it. Nothing is re-parented, so surfaces can never go
 * missing when a component unmounts.
 */
export function InteractiveMesh({ mesh, enabled, onOver, onOut, onClick }: Props) {
  const proxy = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  useEffect(
    () => () => {
      material.dispose();
      document.body.style.cursor = "";
    },
    [material],
  );

  useFrame(() => {
    const p = proxy.current;
    if (!p) return;
    mesh.updateWorldMatrix(true, false);
    p.matrixAutoUpdate = false;
    p.matrix.copy(mesh.matrixWorld);
    p.matrixWorldNeedsUpdate = true;
  });

  return (
    <mesh
      ref={proxy}
      geometry={mesh.geometry}
      material={material}
      renderOrder={-1}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (!enabled) return;
        e.stopPropagation();
        document.body.style.cursor = "pointer";
        onOver?.();
      }}
      onPointerOut={() => {
        if (!enabled) return;
        document.body.style.cursor = "";
        onOut?.();
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!enabled) return;
        e.stopPropagation();
        onClick?.();
      }}
    />
  );
}
