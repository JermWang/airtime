"use client";

import { useMemo } from "react";
import { MeshReflectorMaterial } from "@react-three/drei";
import { surfaceMaps } from "./materials";

/**
 * The auditorium floor: polished marble that also mirrors the picture.
 *
 * A planar reflector carries the screen's light down into the room, and the
 * marble colour/roughness/normal maps ride on top of it so the reflection
 * breaks up over the veining instead of looking like a sheet of glass.
 */
export function ReflectionSurface({ resolution = 1024 }: { resolution?: number }) {
  const maps = useMemo(() => surfaceMaps().marble, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 5.5]} receiveShadow>
      <planeGeometry args={[26, 22]} />
      <MeshReflectorMaterial
        map={maps.map}
        roughnessMap={maps.roughnessMap}
        normalMap={maps.normalMap}
        blur={[300, 90]}
        resolution={resolution}
        mixBlur={0.85}
        mixStrength={9}
        mixContrast={1.15}
        roughness={1}
        depthScale={1.05}
        minDepthThreshold={0.3}
        maxDepthThreshold={1.3}
        color="#ffffff"
        metalness={0.22}
        mirror={0.38}
        reflectorOffset={0}
      />
    </mesh>
  );
}
