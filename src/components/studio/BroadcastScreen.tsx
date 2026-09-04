"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { usePlayer } from "@/components/station/playerStore";
import { useStation } from "@/lib/store";
import type { PlacementDto, QueueEntryDto } from "@/lib/api";
import type { SurfaceInfo } from "./surfaceRegistry";
import { textureFromVideoElement, loadImageTexture, createSlateTexture, type SurfaceTexture } from "./textures";
import { InteractiveMesh } from "./InteractiveMesh";
import { PlacementHighlight } from "./PlacementHighlight";
import { attentionFor, ATTENTION_LAMBDA } from "./attention";

interface Props {
  surface: SurfaceInfo;
  placements: PlacementDto[];
  active: QueueEntryDto[];
  mainPlacement: PlacementDto | null;
}

/**
 * <BroadcastScreen> – the central display. It mirrors the station player's
 * <video> element as a VideoTexture (so 2D and 3D never disagree) and hosts
 * overlay planes (lower third, sponsor bug) that are themselves placements.
 */
export function BroadcastScreen({ surface, placements, active, mainPlacement }: Props) {
  const videoEl = usePlayer((s) => s.videoEl);
  const source = usePlayer((s) => s.source);
  const holding = usePlayer((s) => s.holding);
  const error = usePlayer((s) => s.error);
  const focused = useStation((s) => s.focusedPlacementId);
  const preview = useStation((s) => s.preview);
  const hovered = useStation((s) => s.hoveredPlacementId);
  const highlighted = useStation((s) => s.highlightedPlacementId);
  const mode = useStation((s) => s.mode);
  const hoverPlacement = useStation((s) => s.hoverPlacement);
  const focusPlacement = useStation((s) => s.focusPlacement);
  const safeZones = useStation((s) => s.showSafeZones);

  /**
   * The picture is drawn flat and unlit: the texture, and nothing else.
   *
   * It used to be a lit material that also emitted at 1.3x, which meant the room
   * lighting and the emissive pass both acted on the video and pushed the
   * highlights past the bloom threshold - the glow that sat over everything. A
   * basic material with tone mapping off shows the frame the broadcast actually
   * sent, at its own contrast.
   */
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: true }), []);
  const attention = useRef(1);
  const videoTex = useRef<THREE.VideoTexture | null>(null);
  const altTex = useRef<SurfaceTexture | null>(null);

  useEffect(() => {
    surface.mesh.material = material;
    return () => material.dispose();
  }, [surface, material]);

  useEffect(() => {
    videoTex.current?.dispose();
    videoTex.current = videoEl ? textureFromVideoElement(videoEl) : null;
    return () => {
      videoTex.current?.dispose();
      videoTex.current = null;
    };
  }, [videoEl]);

  // Full-screen preview / image ads / slates render through a canvas texture.
  const mainPreview = mainPlacement && focused === mainPlacement.id ? preview : null;
  const altKey = mainPreview?.url ? `preview:${mainPreview.url}:${mainPreview.fit}` : source?.kind === "campaign-image" ? `img:${source.url}:${source.campaign.fit}` : source?.kind === "slate" ? `slate:${source.title}:${source.subtitle}` : holding ? "slate:Stand by:AIRTIME" : error ? `slate:${error}:AIRTIME` : "video";

  useEffect(() => {
    let cancelled = false;
    const swap = (t: SurfaceTexture | null) => {
      if (cancelled) {
        t?.dispose();
        return;
      }
      const prev = altTex.current;
      altTex.current = t;
      if (prev) setTimeout(() => prev.dispose(), 300);
    };
    if (altKey === "video") {
      swap(null);
    } else if (altKey.startsWith("preview:") && mainPreview?.url) {
      if (mainPreview.kind === "video") {
        // Video preview for the main screen: dedicated element texture.
        const v = document.createElement("video");
        v.src = mainPreview.url;
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.crossOrigin = "anonymous";
        void v.play().catch(() => {});
        const tex = textureFromVideoElement(v);
        swap({ texture: tex, aspect: 16 / 9, kind: "video", dispose: () => { v.pause(); v.removeAttribute("src"); tex.dispose(); } });
      } else {
        void loadImageTexture(mainPreview.url, "16:9", mainPreview.fit).then(swap).catch(() => swap(null));
      }
    } else if (source?.kind === "campaign-image") {
      void loadImageTexture(source.url, "16:9", source.campaign.fit).then(swap).catch(() => swap(createSlateTexture("AIRTIME", "Stand by")));
    } else {
      const [, title, subtitle] = altKey.split(":");
      swap(createSlateTexture(title ?? "AIRTIME", subtitle ?? ""));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [altKey]);

  useFrame((_, dt) => {
    const tex = altTex.current?.texture ?? videoTex.current;
    if (tex && material.map !== tex) {
      material.map = tex;
      material.needsUpdate = true;
    }
    // The picture is the subject while watching and steps back when the viewer is
    // looking at something else. On an unlit material that is a straight multiply
    // on the texture, so dimming never tints or blooms the image.
    const self = { focused: Boolean(mainPlacement && focused === mainPlacement.id), hovered: Boolean(mainPlacement && hovered === mainPlacement.id) };
    attention.current = THREE.MathUtils.damp(attention.current, Math.min(1, attentionFor(mode, "main", self)), ATTENTION_LAMBDA, dt);
    material.color.setScalar(attention.current);
  });

  // Overlay planes in front of the screen, sized from the surface.
  const overlays = useMemo(() => placements.filter((p) => p.type === "OVERLAY" && p.kind !== "ticker"), [placements]);
  const activeByPlacement = useMemo(() => new Map(active.map((e) => [e.placementId, e])), [active]);
  const { width: W, height: H } = surface;

  const layoutFor = (kind: string): { pos: [number, number, number]; size: [number, number] } | null => {
    if (kind === "lower_third") return { pos: [-W / 2 + W * 0.05 + W * 0.3, -H / 2 + H * 0.14 + (W * 0.6) / 8 / 2, 0.012], size: [W * 0.6, (W * 0.6) / 8] };
    if (kind === "sponsor_bug") return { pos: [W / 2 - W * 0.04 - H * 0.045, H / 2 - H * 0.05 - H * 0.045, 0.012], size: [H * 0.09, H * 0.09] };
    return null;
  };

  return (
    <>
      {mainPlacement ? (
        <>
          <InteractiveMesh mesh={surface.mesh} enabled={mode !== "preview"} onOver={() => hoverPlacement(mainPlacement.id)} onOut={() => hoverPlacement(null)} onClick={() => focusPlacement(mainPlacement.id)} />
          <PlacementHighlight surface={surface} placement={mainPlacement} visible={mode === "browse" || hovered === mainPlacement.id || highlighted === mainPlacement.id || focused === mainPlacement.id} strong={hovered === mainPlacement.id || focused === mainPlacement.id} campaign={active.find((e) => e.placementType === "FULLSCREEN") ?? null} />
        </>
      ) : null}
    <group position={surface.center} quaternion={surface.mesh.getWorldQuaternion(new THREE.Quaternion())}>
      {safeZones && focused && (mainPlacement?.id === focused || overlays.some((o) => o.id === focused)) && (
        <lineSegments position={[0, 0, 0.02]}>
          <edgesGeometry args={[new THREE.PlaneGeometry(W * 0.9, H * 0.9)]} />
          <lineBasicMaterial color="#ccff00" transparent opacity={0.6} />
        </lineSegments>
      )}
      {overlays.map((p) => {
        const layout = layoutFor(p.kind);
        if (!layout) return null;
        const entry = activeByPlacement.get(p.id) ?? null;
        const pv = focused === p.id ? preview : null;
        return <OverlayPlane key={p.id} placement={p} layout={layout} campaign={entry} preview={pv} />;
      })}
    </group>
    </>
  );
}

function OverlayPlane({ placement, layout, campaign, preview }: { placement: PlacementDto; layout: { pos: [number, number, number]; size: [number, number] }; campaign: QueueEntryDto | null; preview: { url?: string; fit: "FIT" | "FILL" } | null }) {
  const material = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, toneMapped: false, depthWrite: false }), []);
  const texRef = useRef<SurfaceTexture | null>(null);
  const hoverPlacement = useStation((s) => s.hoverPlacement);
  const focusPlacement = useStation((s) => s.focusPlacement);
  const hovered = useStation((s) => s.hoveredPlacementId) === placement.id;
  const highlighted = useStation((s) => s.highlightedPlacementId) === placement.id;
  const focused = useStation((s) => s.focusedPlacementId) === placement.id;
  const mode = useStation((s) => s.mode);
  const url = preview?.url ?? campaign?.creative?.url ?? null;
  const target = useRef(0);

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      target.current = 0;
      return;
    }
    void loadImageTexture(url, `${layout.size[0]}:${layout.size[1]}`, "FIT")
      .then((t) => {
        if (cancelled) return t.dispose();
        texRef.current?.dispose();
        texRef.current = t;
        // Overlay images keep transparency: rebuild as plain texture without baked bars.
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const tex = new THREE.Texture(img);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;
          texRef.current?.dispose();
          texRef.current = { texture: tex, aspect: 1, kind: "image", dispose: () => tex.dispose() };
          material.map = tex;
          material.needsUpdate = true;
          target.current = 1;
        };
        img.src = url;
      })
      .catch(() => (target.current = 0));
    return () => {
      cancelled = true;
    };
  }, [url, layout.size, material]);

  useFrame((_, dt) => {
    material.opacity = THREE.MathUtils.damp(material.opacity, target.current, 6, dt);
  });

  const show = mode === "browse" || hovered || highlighted || focused;
  return (
    <group position={layout.pos}>
      <mesh
        material={material}
        onPointerOver={(e) => {
          if (mode === "preview") return;
          e.stopPropagation();
          hoverPlacement(placement.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          hoverPlacement(null);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          if (mode === "preview") return;
          e.stopPropagation();
          focusPlacement(placement.id);
        }}
      >
        <planeGeometry args={layout.size} />
      </mesh>
      {show && (
        <lineSegments position={[0, 0, 0.004]}>
          <edgesGeometry args={[new THREE.PlaneGeometry(layout.size[0] * 1.02, layout.size[1] * 1.06)]} />
          <lineBasicMaterial color="#ccff00" transparent opacity={hovered || focused ? 0.9 : 0.4} />
        </lineSegments>
      )}
    </group>
  );
}
