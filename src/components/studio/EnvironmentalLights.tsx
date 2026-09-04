"use client";

import { useEffect } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { TIERS, type Tier } from "./perf";

/**
 * Studio lighting: soft key from the truss, screen spill from the main display
 * and LED wall, restrained green accent from the side walls, one shadow-casting
 * spot for grounding. Everything else comes from the procedural environment map.
 */
export function EnvironmentalLights({ tier }: { tier: Tier }) {
  const cfg = TIERS[tier];
  useEffect(() => {
    RectAreaLightUniformsLib.init();
  }, []);
  return (
    <>
      <hemisphereLight args={["#3d4650", "#0b0d10", 1.15]} />
      <ambientLight intensity={0.35} color="#aeb8c4" />
      <spotLight
        position={[0, 8.4, 3.5]}
        angle={0.62}
        penumbra={0.9}
        intensity={140}
        distance={30}
        decay={2}
        color="#e9eef2"
        castShadow={cfg.shadows}
        shadow-mapSize={[cfg.shadowMapSize, cfg.shadowMapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        target-position={[0, 0.8, -2]}
      />
      <spotLight position={[-8, 7.8, 2]} angle={0.7} penumbra={1} intensity={70} distance={34} decay={2} color="#d6dde3" />
      <spotLight position={[8, 7.8, 2]} angle={0.7} penumbra={1} intensity={70} distance={34} decay={2} color="#d6dde3" />
      {/* Screen spill */}
      <rectAreaLight position={[0, 3.65, -6.2]} width={9.6} height={5.4} intensity={3.2} color="#cfd8e3" rotation={[0, 0, 0]} />
      <rectAreaLight position={[0, 3.4, -7.6]} width={19} height={5.4} intensity={1.5} color="#9fb0c0" rotation={[0, 0, 0]} />
      {/* Accent */}
      <pointLight position={[-14.4, 6.4, -1]} intensity={9} distance={11} decay={2} color="#ccff00" />
      <pointLight position={[14.4, 6.4, -1]} intensity={9} distance={11} decay={2} color="#ccff00" />
      <RectTargets />
    </>
  );
}

/** rectAreaLights look down their -Z; rotate them to face the room. */
function RectTargets() {
  useEffect(() => {
    // no-op; rectAreaLights above are authored facing +Z (toward the audience).
  }, []);
  return null;
}

export const LIGHT_HELPER = THREE;
