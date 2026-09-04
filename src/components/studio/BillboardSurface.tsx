"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { PlacementDto, QueueEntryDto, ShowcaseDto } from "@/lib/api";
import type { PreviewCreative } from "@/lib/store";
import { useStation } from "@/lib/store";
import { useSurfaces, describeSurface, type SurfaceInfo } from "./surfaceRegistry";
import { createHouseTexture, createShowcaseTexture, loadImageTexture, createVideoTexture, type SurfaceTexture } from "./textures";
import { PlacementHighlight } from "./PlacementHighlight";
import { InteractiveMesh } from "./InteractiveMesh";

interface Props {
  placement: PlacementDto;
  /** Mesh-backed surface from the GLTF, or null for transform-backed placements. */
  surface: SurfaceInfo | null;
  campaign: QueueEntryDto | null;
  preview: PreviewCreative | null;
  allowVideo: boolean;
  /** House showcase card for this surface while it is unbooked, if one is assigned. */
  showcase?: ShowcaseDto | null;
}

/**
 * <BillboardSurface> maps a dynamic image/video texture onto a named GLTF mesh
 * (or its own plane when the placement is positioned by transform).
 *
 * Texture changes cross-fade in place; nothing reloads the page. Every texture
 * is disposed when replaced or unmounted.
 */
export function BillboardSurface({ placement, surface, campaign, preview, allowVideo, showcase }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const planeRef = useRef<THREE.Mesh>(null);
  const register = useSurfaces((s) => s.register);
  const unregister = useSurfaces((s) => s.unregister);
  const focusPlacement = useStation((s) => s.focusPlacement);
  const hoverPlacement = useStation((s) => s.hoverPlacement);
  const hovered = useStation((s) => s.hoveredPlacementId) === placement.id;
  const highlighted = useStation((s) => s.highlightedPlacementId) === placement.id;
  const focused = useStation((s) => s.focusedPlacementId) === placement.id;
  const mode = useStation((s) => s.mode);

  const [current, setCurrent] = useState<SurfaceTexture | null>(null);
  const currentRef = useRef<SurfaceTexture | null>(null);
  const fade = useRef(0);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.28,
        metalness: 0.02,
        emissive: new THREE.Color("#ffffff"),
        emissiveIntensity: 0,
        toneMapped: true,
      }),
    [],
  );

  // Transform-backed placements own a plane; register it so the camera can frame it.
  const transform = placement.transform;
  useEffect(() => {
    if (surface || !planeRef.current) return;
    const info = describeSurface(planeRef.current);
    register({ ...info, name: placement.id });
    return () => unregister(placement.id);
  }, [surface, placement.id, register, unregister, transform]);

  // Decide what should be displayed: preview > paid campaign > house graphic.
  const desired = useMemo(() => {
    if (preview) {
      if (preview.kind === "video" && preview.url) return { kind: "video" as const, url: preview.url, fit: preview.fit };
      if (preview.url) return { kind: "image" as const, url: preview.url, fit: preview.fit };
    }
    if (campaign?.creative?.url) {
      const c = campaign.creative;
      return c.type === "VIDEO" ? { kind: "video" as const, url: c.url!, fit: campaign.fit, startsAt: campaign.startsAt } : { kind: "image" as const, url: c.url!, fit: campaign.fit };
    }
    if (showcase) return { kind: "showcase" as const, id: showcase.id, fit: "FILL" as const };
    return { kind: "house" as const, fit: "FILL" as const };
  }, [preview, campaign, showcase]);

  const key = `${desired.kind}:${"url" in desired ? desired.url : "id" in desired ? desired.id : "house"}:${desired.fit}`;

  useEffect(() => {
    let cancelled = false;
    const apply = (tex: SurfaceTexture | null) => {
      if (cancelled || !tex) {
        tex?.dispose();
        return;
      }
      const previous = currentRef.current;
      currentRef.current = tex;
      setCurrent(tex);
      fade.current = 0;
      // Dispose the previous texture after the cross-fade completes.
      if (previous) setTimeout(() => previous.dispose(), 500);
    };

    if (desired.kind === "image") {
      void loadImageTexture(desired.url, placement.aspectRatio, desired.fit).then(apply).catch(() => apply(createHouseTexture({ aspect: placement.aspectRatio, label: "AIRTIME", sublabel: placement.name })));
    } else if (desired.kind === "video") {
      if (!allowVideo) {
        apply(createHouseTexture({ aspect: placement.aspectRatio, label: campaign?.displayName ?? "AIRTIME", sublabel: placement.name }));
      } else {
        const offsetSec = "startsAt" in desired && desired.startsAt ? Math.max(0, (Date.now() - new Date(desired.startsAt).getTime()) / 1000) : 0;
        apply(createVideoTexture(desired.url, placement.aspectRatio, desired.fit, { loop: !campaign, offsetSec }));
      }
    } else if (desired.kind === "showcase" && showcase) {
      apply(createShowcaseTexture({ label: showcase.label, headline: showcase.headline, sublabel: showcase.sublabel, accent: showcase.accent }, placement.aspectRatio));
    } else {
      apply(createHouseTexture({ aspect: placement.aspectRatio, label: "AIRTIME", sublabel: placement.name, variant: "billboard" }));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, allowVideo]);

  useEffect(
    () => () => {
      currentRef.current?.dispose();
      material.dispose();
    },
    [material],
  );

  // Apply texture + emissive behaviour, and pause offscreen video.
  useFrame((state, dt) => {
    const tex = currentRef.current;
    if (!tex) return;
    if (material.map !== tex.texture) {
      material.map = tex.texture;
      material.emissiveMap = tex.texture;
      material.needsUpdate = true;
    }
    fade.current = Math.min(1, fade.current + dt * 2.2);
    const base = placement.material.emissiveIntensity;
    const boost = focused ? 1.25 : hovered || highlighted ? 1.12 : 1;
    material.emissiveIntensity = base * boost * fade.current;
    material.opacity = fade.current;

    if (tex.setActive) {
      const target = surface?.center ?? new THREE.Vector3().setFromMatrixPosition(planeRef.current?.matrixWorld ?? new THREE.Matrix4());
      const toCam = state.camera.position.clone().sub(target);
      const facing = surface ? surface.normal.dot(toCam.normalize()) > -0.1 : true;
      const distance = state.camera.position.distanceTo(target);
      tex.setActive(facing && distance < 40 && document.visibilityState === "visible");
    }
  });

  // Attach the material to the GLTF mesh when mesh-backed.
  useEffect(() => {
    if (!surface) return;
    const previous = surface.mesh.material;
    surface.mesh.material = material;
    return () => {
      surface.mesh.material = previous;
    };
  }, [surface, material]);

  const interactive = mode !== "preview";
  const [aw, ah] = placement.aspectRatio.split(":").map(Number);

  if (surface) {
    return (
      <>
        <InteractiveMesh
          mesh={surface.mesh}
          enabled={interactive}
          onOver={() => hoverPlacement(placement.id)}
          onOut={() => hoverPlacement(null)}
          onClick={() => focusPlacement(placement.id)}
        />
        <PlacementHighlight surface={surface} placement={placement} visible={mode === "browse" || hovered || highlighted || focused} strong={hovered || focused} campaign={campaign} />
      </>
    );
  }

  if (!transform) return null;
  return (
    <group ref={groupRef} position={transform.position} rotation={transform.rotation}>
      <mesh
        ref={planeRef}
        scale={[transform.scale[0], transform.scale[1], 1]}
        material={material}
        onPointerOver={(e) => {
          if (!interactive) return;
          e.stopPropagation();
          hoverPlacement(placement.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          hoverPlacement(null);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          if (!interactive) return;
          e.stopPropagation();
          focusPlacement(placement.id);
        }}
      >
        <planeGeometry args={[1, ah / aw]} />
      </mesh>
      {/* Thin anodized frame */}
      <mesh position={[0, 0, -0.02]} scale={[transform.scale[0] * 1.04, transform.scale[1] * (ah / aw) * 1.04, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color="#0a0b0d" metalness={0.9} roughness={0.35} />
      </mesh>
      {planeRef.current && (
        <PlacementHighlight
          surface={{ name: placement.id, mesh: planeRef.current, center: new THREE.Vector3(...transform.position), normal: new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(...transform.rotation)), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(1, 0, 0), width: transform.scale[0], height: transform.scale[1] * (ah / aw), isMonitor: false }}
          placement={placement}
          visible={mode === "browse" || hovered || highlighted || focused}
          strong={hovered || focused}
          campaign={campaign}
          local
        />
      )}
    </group>
  );
}
