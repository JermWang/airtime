"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, TransformControls, useGLTF, Html, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import type { PlacementDto } from "@/lib/api";
import { STUDIO_MODEL } from "@/components/studio/BroadcastStudio";

export interface EditorTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

interface Props {
  placements: PlacementDto[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Transform-backed placement moved in the editor. */
  onTransform: (id: string, t: EditorTransform) => void;
  /** Mesh picked in the scene for the selected placement. */
  onPickMesh: (meshName: string) => void;
  pickMode: boolean;
  draft: Record<string, EditorTransform>;
}

/**
 * Visual placement editor: the real studio GLTF with orbit controls. Select a
 * placement, drag transform gizmos (position / rotation / scale) for
 * transform-backed surfaces, or click any named mesh to bind the placement to it.
 */
export function PlacementEditor(props: Props) {
  const [mode, setMode] = useState<"translate" | "rotate" | "scale">("translate");
  return (
    <div className="relative h-[520px] overflow-hidden rounded-lg border border-white/10 bg-black">
      <Canvas camera={{ position: [0, 5, 16], fov: 45, near: 0.1, far: 100 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
        <color attach="background" args={["#08090b"]} />
        <hemisphereLight args={["#2a3138", "#07080a", 0.8]} />
        <directionalLight position={[4, 10, 6]} intensity={1.4} />
        <Suspense fallback={null}>
          <Environment resolution={64} frames={1}>
            <Lightformer intensity={2} form="rect" position={[0, 8, -2]} scale={[12, 1, 1]} />
          </Environment>
          <Scene {...props} mode={mode} />
        </Suspense>
        <OrbitControls makeDefault target={[0, 3, -4]} maxPolarAngle={Math.PI / 2 - 0.02} minDistance={2} maxDistance={40} />
        <gridHelper args={[30, 30, "#1b1f24", "#111418"]} position={[0, 0.002, -1]} />
      </Canvas>
      <div className="absolute left-3 top-3 flex gap-1">
        {(["translate", "rotate", "scale"] as const).map((m) => (
          <button key={m} className={`btn btn-sm ${mode === m ? "bg-white/10" : ""}`} onClick={() => setMode(m)}>
            {m}
          </button>
        ))}
      </div>
      <div className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-[10.5px] text-ink-300">
        {props.pickMode ? "Pick mode: click any mesh to bind it to the selected placement" : "Drag to orbit · click a surface to select its placement · use the gizmo to move transform-backed placements"}
      </div>
    </div>
  );
}

function Scene({ placements, selectedId, onSelect, onTransform, onPickMesh, pickMode, draft, mode }: Props & { mode: "translate" | "rotate" | "scale" }) {
  const { scene } = useGLTF(STUDIO_MODEL);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const meshes = useMemo(() => {
    const list: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) list.push(o);
    });
    return list;
  }, [scene]);
  const byMesh = useMemo(() => new Map(placements.filter((p) => p.meshName).map((p) => [p.meshName!, p])), [placements]);
  const selected = placements.find((p) => p.id === selectedId) ?? null;
  const [hover, setHover] = useState<string | null>(null);

  // Dress: dim everything, highlight surfaces / mapped meshes.
  useEffect(() => {
    for (const m of meshes) {
      const extras = m.userData as { surface?: boolean; role?: string };
      const mapped = byMesh.get(m.name);
      const isSel = selected?.meshName === m.name;
      const base = new THREE.MeshStandardMaterial({ color: extras.surface ? "#1a1f25" : "#101317", roughness: 0.6, metalness: 0.2, emissive: isSel ? "#ccff00" : mapped ? "#4a5c00" : hover === m.name ? "#3a4416" : "#000000", emissiveIntensity: isSel ? 0.6 : 0.5, transparent: extras.role === "glass", opacity: extras.role === "glass" ? 0.3 : 1 });
      m.material = base;
    }
  }, [meshes, byMesh, selected, hover]);

  const transformTarget = useRef<THREE.Group>(null);
  const t = selected && !selected.meshName ? draft[selected.id] ?? selected.transform : null;
  const [aw, ah] = (selected?.aspectRatio ?? "16:9").split(":").map(Number);

  return (
    <group>
      {meshes.map((m) => (
        <primitive
          key={m.uuid}
          object={m}
          onPointerOver={(e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            setHover(m.name);
          }}
          onPointerOut={() => setHover(null)}
          onClick={(e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            if (pickMode && selected) {
              onPickMesh(m.name);
              return;
            }
            const p = byMesh.get(m.name);
            onSelect(p ? p.id : null);
          }}
        />
      ))}
      {/* Transform-backed placements */}
      {placements
        .filter((p) => !p.meshName && (draft[p.id] ?? p.transform))
        .map((p) => {
          const tr = draft[p.id] ?? p.transform!;
          const [w, h] = p.aspectRatio.split(":").map(Number);
          const isSel = p.id === selectedId;
          return (
            <group key={p.id} position={tr.position} rotation={tr.rotation} onClick={(e) => { e.stopPropagation(); onSelect(p.id); }}>
              <mesh scale={[tr.scale[0], tr.scale[1] * (h / w), 1]}>
                <planeGeometry args={[1, 1]} />
                <meshStandardMaterial color="#1a1f25" emissive={isSel ? "#ccff00" : "#4a5c00"} emissiveIntensity={0.6} side={THREE.DoubleSide} />
              </mesh>
              <Html center position={[0, tr.scale[1] * (h / w) * 0.5 + 0.3, 0]} style={{ pointerEvents: "none" }}>
                <div className="chip">{p.id}</div>
              </Html>
            </group>
          );
        })}
      {/* Gizmo for the selected transform-backed placement */}
      {selected && t && (
        <TransformControls
          mode={mode}
          onMouseDown={() => {
            if (controls) controls.enabled = false;
          }}
          onMouseUp={() => {
            if (controls) controls.enabled = true;
            const g = transformTarget.current;
            if (!g) return;
            onTransform(selected.id, { position: [g.position.x, g.position.y, g.position.z], rotation: [g.rotation.x, g.rotation.y, g.rotation.z], scale: [g.scale.x, g.scale.y, 1] });
          }}
        >
          <group ref={transformTarget} position={t.position} rotation={t.rotation} scale={[t.scale[0], t.scale[1], 1]}>
            <mesh>
              <planeGeometry args={[1, ah / aw]} />
              <meshBasicMaterial color="#ccff00" transparent opacity={0.15} side={THREE.DoubleSide} />
            </mesh>
          </group>
        </TransformControls>
      )}
      {hover && (
        <Html position={[0, 9.4, 0]} center style={{ pointerEvents: "none" }}>
          <div className="chip">{hover}</div>
        </Html>
      )}
    </group>
  );
}
