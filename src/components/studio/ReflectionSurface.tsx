"use client";

import { MeshReflectorMaterial } from "@react-three/drei";

/**
 * <ReflectionSurface> – the studio floor. A planar reflector with heavy blur
 * reads as polished concrete/anodized flooring and grounds the screens'
 * light without the cost of screen-space reflections.
 */
export function ReflectionSurface({ resolution = 1024 }: { resolution?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, -1]} receiveShadow>
      <planeGeometry args={[30, 22]} />
      <MeshReflectorMaterial
        blur={[420, 140]}
        resolution={resolution}
        mixBlur={1}
        mixStrength={14}
        mixContrast={1}
        roughness={0.82}
        depthScale={1.1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        color="#08090b"
        metalness={0.55}
        mirror={0.45}
        reflectorOffset={0}
      />
    </mesh>
  );
}
