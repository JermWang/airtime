"use client";

import { useEffect } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { TIERS, type Tier } from "./perf";

/**
 * Screening-room lighting: the picture is the brightest thing in the room and
 * most of what you see on the walls and floor is its own spill. A soft key from
 * the truss keeps the space readable, and a restrained lime accent runs along
 * the side walls. Everything else comes from the procedural environment map.
 */
export function EnvironmentalLights({ tier }: { tier: Tier }) {
  const cfg = TIERS[tier];
  useEffect(() => {
    RectAreaLightUniformsLib.init();
  }, []);
  return (
    <>
      <hemisphereLight args={["#48545f", "#101418", 1.6]} />
      <ambientLight intensity={0.5} color="#b6c0cc" />
      <spotLight
        position={[0, 11.6, 3.2]}
        angle={0.7}
        penumbra={0.95}
        intensity={110}
        distance={26}
        decay={2}
        color="#e9eef2"
        castShadow={cfg.shadows}
        shadow-mapSize={[cfg.shadowMapSize, cfg.shadowMapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        target-position={[0, 1, -3]}
      />
      {/* A broad wash down onto the marble, well outside the shot. */}
      <spotLight position={[0, 12.4, 7]} angle={1.02} penumbra={1} intensity={150} distance={34} decay={2} color="#c9d4e0" target-position={[0, 0, 3]} />
      <spotLight position={[-9, 11, 3.2]} angle={0.72} penumbra={1} intensity={45} distance={28} decay={2} color="#d6dde3" />
      <spotLight position={[9, 11, 3.2]} angle={0.72} penumbra={1} intensity={45} distance={28} decay={2} color="#d6dde3" />
      {/* Spill from the picture onto the room. Deliberately gentle: it should
          light the wall and floor a little, never ring the frame with a halo. */}
      <rectAreaLight position={[0, 6.4, -5.1]} width={17.8} height={10} intensity={2.2} color="#cfd8e3" rotation={[0, 0, 0]} />
      {/* Signal-green hairlines high on the side walls. */}
      <pointLight position={[-12.6, 10.5, 2]} intensity={9} distance={14} decay={2} color="#ccff00" />
      <pointLight position={[12.6, 10.5, 2]} intensity={9} distance={14} decay={2} color="#ccff00" />
    </>
  );
}

export const LIGHT_HELPER = THREE;
