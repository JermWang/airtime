"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { PlacementDto, QueueEntryDto } from "@/lib/api";
import type { PreviewCreative } from "@/lib/store";
import { useStation } from "@/lib/store";
import { useBroadcastState } from "@/lib/hooks";
import type { SurfaceInfo } from "./surfaceRegistry";
import { createTickerTexture } from "./textures";
import { InteractiveMesh } from "./InteractiveMesh";
import { PlacementHighlight } from "./PlacementHighlight";

interface Props {
  surface: SurfaceInfo;
  placement: PlacementDto | null;
  campaign: QueueEntryDto | null;
  preview: PreviewCreative | null;
}

/** <BroadcastTicker3D> – the LED ribbon under the main display. Scrolls the sold ticker text or house copy. */
export function BroadcastTicker3D({ surface, placement, campaign, preview }: Props) {
  const { data: state } = useBroadcastState("MAIN");
  const hovered = useStation((s) => s.hoveredPlacementId);
  const highlighted = useStation((s) => s.highlightedPlacementId);
  const focused = useStation((s) => s.focusedPlacementId);
  const mode = useStation((s) => s.mode);
  const hoverPlacement = useStation((s) => s.hoverPlacement);
  const focusPlacement = useStation((s) => s.focusPlacement);

  const text = preview?.kind === "text" && preview.text ? preview.text : campaign?.creative?.textContent ?? `AIRTIME · ${state?.now?.title ?? "On air"} · Built on Robinhood Chain · Every surface in this room is available airtime`;
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), []);
  const ticker = useRef<ReturnType<typeof createTickerTexture> | null>(null);

  useEffect(() => {
    const t = createTickerTexture(text, "32:1");
    ticker.current?.dispose();
    ticker.current = t;
    material.map = t.texture;
    material.needsUpdate = true;
    return () => {
      t.dispose();
      if (ticker.current === t) ticker.current = null;
    };
  }, [text, material]);

  useEffect(() => {
    surface.mesh.material = material;
    return () => material.dispose();
  }, [surface, material]);

  useFrame((_, dt) => {
    ticker.current?.update(Math.min(dt, 0.05));
  });

  if (!placement) return null;
  const active = mode === "browse" || hovered === placement.id || highlighted === placement.id || focused === placement.id;
  return (
    <>
      <InteractiveMesh mesh={surface.mesh} enabled={mode !== "preview"} onOver={() => hoverPlacement(placement.id)} onOut={() => hoverPlacement(null)} onClick={() => focusPlacement(placement.id)} />
      <PlacementHighlight surface={surface} placement={placement} visible={active} strong={hovered === placement.id || focused === placement.id} campaign={campaign} />
    </>
  );
}
