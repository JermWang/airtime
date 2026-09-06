"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { PlacementDto, QueueEntryDto } from "@/lib/api";
import type { SurfaceInfo } from "./surfaceRegistry";
import { formatWei } from "@/lib/format";

interface Props {
  surface: SurfaceInfo;
  placement: PlacementDto;
  visible: boolean;
  strong: boolean;
  campaign: QueueEntryDto | null;
  /** Render in the parent's local space (transform-backed placements). */
  local?: boolean;
}

/**
 * <PlacementHighlight> – an extremely subtle emissive edge around a surface
 * plus a small contextual label. Fades in/out; never a hard modal.
 */
export function PlacementHighlight({ surface, placement, visible, strong, campaign, local }: Props) {
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: "#ccff00", transparent: true, opacity: 0, toneMapped: false }), []);
  const geometry = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(surface.width * 1.012, surface.height * 1.02)), [surface.width, surface.height]);
  const opacity = useRef(0);
  const target = visible ? (strong ? 0.95 : 0.42) : 0;

  useFrame((_, dt) => {
    opacity.current = THREE.MathUtils.damp(opacity.current, target, 8, dt);
    lineMat.opacity = opacity.current;
  });

  const quaternion = useMemo(() => surface.mesh.getWorldQuaternion(new THREE.Quaternion()), [surface]);
  const position = local ? new THREE.Vector3(0, 0, 0.01) : surface.center.clone().add(surface.normal.clone().multiplyScalar(0.015));
  const labelPos = local ? new THREE.Vector3(0, surface.height / 2 + 0.12, 0.02) : surface.center.clone().add(surface.up.clone().multiplyScalar(surface.height / 2 + 0.12)).add(surface.normal.clone().multiplyScalar(0.02));

  return (
    <group>
      <lineSegments geometry={geometry} material={lineMat} position={position} quaternion={local ? undefined : quaternion} />
      {visible && (
        <Html position={labelPos} center distanceFactor={local ? undefined : 9} transform={false} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className="glass whitespace-nowrap rounded-md px-2.5 py-1.5" style={{ opacity: strong ? 1 : 0.85 }}>
            <div className="label-strong">{placement.name}</div>
            <div className="mono text-[10px] tracking-[0.1em] text-ink-300">
              {campaign ? `On air · ${campaign.displayName}` : `open · from ${formatWei(placement.auction.floorPriceWei)}`}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
