"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { usePlayer } from "@/components/station/playerStore";
import type { SurfaceInfo } from "./surfaceRegistry";
import { createHouseTexture, textureFromVideoElement } from "./textures";

/**
 * <StudioMonitor> – small monitors that no placement has claimed. Some mirror
 * the station feed (sharing the single video element), the rest show house
 * graphics. Any of them becomes inventory the moment an operator maps a
 * placement to its mesh name.
 */
export function StudioMonitor({ surface, variant }: { surface: SurfaceInfo; variant: "feed" | "house" }) {
  const videoEl = usePlayer((s) => s.videoEl);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3, emissive: "#ffffff", emissiveIntensity: 0.7 }), []);
  const house = useRef(createHouseTexture({ aspect: "16:9", label: "AIRTIME", sublabel: surface.name.replace(/_/g, " "), variant: "monitor" }));
  const feed = useRef<THREE.VideoTexture | null>(null);

  useEffect(() => {
    surface.mesh.material = material;
    return () => material.dispose();
  }, [surface, material]);

  useEffect(() => {
    feed.current?.dispose();
    feed.current = variant === "feed" && videoEl ? textureFromVideoElement(videoEl) : null;
    return () => {
      feed.current?.dispose();
      feed.current = null;
    };
  }, [videoEl, variant]);

  useEffect(() => {
    const h = house.current;
    return () => h.dispose();
  }, []);

  useFrame(() => {
    const tex = feed.current ?? house.current.texture;
    if (material.map !== tex) {
      material.map = tex;
      material.emissiveMap = tex;
      material.needsUpdate = true;
    }
  });

  return null;
}
