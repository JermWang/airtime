/**
 * Builds public/models/studio.glb – the AIRTIME auditorium.
 *
 * The room is authored procedurally (no external DCC asset) but exported as a
 * real, standard glTF binary, so the runtime is purely GLTF-driven: meshes are
 * addressed by name and Screen_Main is the single sellable surface.
 *
 * Coordinate system: metres, Y up, stage centre at origin, audience at +Z.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";

type Vec3 = [number, number, number];

interface MaterialDef {
  name: string;
  color: Vec3;
  metallic: number;
  roughness: number;
  emissive?: Vec3;
  alpha?: number;
  doubleSided?: boolean;
}

interface MeshDef {
  name: string;
  geometry: THREE.BufferGeometry;
  material: string;
  position?: Vec3;
  rotation?: Vec3; // Euler XYZ radians
  scale?: Vec3;
  extras?: Record<string, unknown>;
}

const materials: MaterialDef[] = [
  { name: "Marble", color: [0.06, 0.062, 0.068], metallic: 0.05, roughness: 0.14 },
  { name: "MetalPanel", color: [0.085, 0.09, 0.098], metallic: 0.85, roughness: 0.38 },
  { name: "Ceiling", color: [0.035, 0.037, 0.041], metallic: 0.1, roughness: 0.85 },
  { name: "Anodized", color: [0.045, 0.047, 0.052], metallic: 0.95, roughness: 0.28 },
  { name: "BrushedMetal", color: [0.22, 0.23, 0.24], metallic: 0.95, roughness: 0.36 },
  { name: "Screen", color: [0.008, 0.008, 0.01], metallic: 0.0, roughness: 0.28, emissive: [0, 0, 0] },
  { name: "Cove", color: [1, 1, 1], metallic: 0, roughness: 1, emissive: [0.28, 0.31, 0.36] },
];

const meshes: MeshDef[] = [];

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const plane = (w: number, h: number) => new THREE.PlaneGeometry(w, h);

function add(def: MeshDef) {
  meshes.push(def);
}

/* --------------------------------------------------------------------- */
/*  The auditorium                                                        */
/* --------------------------------------------------------------------- */

/*
 * A theatre, not an office.
 *
 * One picture, centred on the back wall, with display panels around it: one
 * either side at the same eye line, a row of three above it, and a tall one
 * standing outboard at the full height of the picture. Everything else is
 * material — polished marble underfoot, brushed metal panels, a machined bezel
 * around each screen and a cove washing the wall behind them.
 *
 * Seven meshes are inventory: Screen_Main (the show and the commercial break)
 * and the six panels (spots only). The textures are generated at runtime from
 * the `role` extras below, so this file stays pure geometry.
 */

const ROOM_W = 30;
const ROOM_H = 13;
const ROOM_D = 22;
const BACK_Z = -5.5;

add({ name: "Floor", geometry: plane(ROOM_W, ROOM_D), material: "Marble", position: [0, 0, BACK_Z + ROOM_D / 2], rotation: [-Math.PI / 2, 0, 0], extras: { role: "floor" } });
add({ name: "Ceiling", geometry: plane(ROOM_W, ROOM_D), material: "Ceiling", position: [0, ROOM_H, BACK_Z + ROOM_D / 2], rotation: [Math.PI / 2, 0, 0], extras: { role: "ceiling" } });
add({ name: "Wall_Back", geometry: plane(ROOM_W, ROOM_H), material: "MetalPanel", position: [0, ROOM_H / 2, BACK_Z], extras: { role: "wall" } });
add({ name: "Wall_Left", geometry: plane(ROOM_D, ROOM_H), material: "MetalPanel", position: [-ROOM_W / 2, ROOM_H / 2, BACK_Z + ROOM_D / 2], rotation: [0, Math.PI / 2, 0], extras: { role: "wall" } });
add({ name: "Wall_Right", geometry: plane(ROOM_D, ROOM_H), material: "MetalPanel", position: [ROOM_W / 2, ROOM_H / 2, BACK_Z + ROOM_D / 2], rotation: [0, -Math.PI / 2, 0], extras: { role: "wall" } });

/* --------------------------------------------------------------------- */
/*  The picture                                                            */
/* --------------------------------------------------------------------- */

/* Dead centre of the back wall, horizontally and vertically. */
const MAIN_W = 12.6;
const MAIN_H = MAIN_W * (9 / 16);
const MAIN_Y = ROOM_H / 2;
const MAIN_Z = BACK_Z + 0.3;

add({ name: "Bezel_Main", geometry: box(MAIN_W + 0.24, MAIN_H + 0.24, 0.3), material: "Anodized", position: [0, MAIN_Y, MAIN_Z - 0.16], extras: { role: "metal" } });
add({ name: "Screen_Main", geometry: plane(MAIN_W, MAIN_H), material: "Screen", position: [0, MAIN_Y, MAIN_Z], extras: { surface: true, aspect: "16:9", main: true } });

/* --------------------------------------------------------------------- */
/*  Display panels either side - spots only                                */
/* --------------------------------------------------------------------- */

/* Same eye line as the picture, turned a few degrees inward so they read as
 * part of the room rather than as posters stuck on the wall. */
const PANEL_W = 2.4;
const PANEL_H = PANEL_W * (9 / 16);
const PANEL_X = MAIN_W / 2 + 0.4 + PANEL_W / 2;

for (const side of [-1, 1] as const) {
  const name = side < 0 ? "Left" : "Right";
  const x = side * PANEL_X;
  const rot: Vec3 = [0, -side * 0.13, 0];
  add({ name: `Bezel_${name}`, geometry: box(PANEL_W + 0.16, PANEL_H + 0.16, 0.22), material: "Anodized", position: [x, MAIN_Y, MAIN_Z - 0.12], rotation: rot, extras: { role: "metal" } });
  add({ name: `Panel_${name}`, geometry: plane(PANEL_W, PANEL_H), material: "Screen", position: [x, MAIN_Y, MAIN_Z], rotation: rot, extras: { surface: true, aspect: "16:9" } });
}

/* --------------------------------------------------------------------- */
/*  The row above the picture, and the tower outboard of it                */
/* --------------------------------------------------------------------- */

/* Three panels across the top, sitting in the gap between the picture and the
 * ceiling, and one portrait panel standing off the right-hand end of the wall
 * at the full height of the picture. The row is laid out across the width of
 * the picture so the whole cluster reads as one wall of screens rather than
 * as panels drifting in space. */
const TOP_H = 1.25;
const TOP_Y = MAIN_Y + MAIN_H / 2 + 0.42 + TOP_H / 2;
const TOP_GAP = 0.32;

const topRow: Array<{ name: string; w: number; aspect: string }> = [
  { name: "TopLeft", w: TOP_H * (16 / 9), aspect: "16:9" },
  { name: "TopMid", w: TOP_H * (16 / 9), aspect: "16:9" },
  { name: "TopRight", w: TOP_H, aspect: "1:1" },
];

const topSpan = topRow.reduce((sum, p) => sum + p.w, 0) + TOP_GAP * (topRow.length - 1);
let cursor = -topSpan / 2;
for (const panel of topRow) {
  const x = cursor + panel.w / 2;
  cursor += panel.w + TOP_GAP;
  add({ name: `Bezel_${panel.name}`, geometry: box(panel.w + 0.12, TOP_H + 0.12, 0.18), material: "Anodized", position: [x, TOP_Y, MAIN_Z - 0.1], extras: { role: "metal" } });
  add({ name: `Panel_${panel.name}`, geometry: plane(panel.w, TOP_H), material: "Screen", position: [x, TOP_Y, MAIN_Z], extras: { surface: true, aspect: panel.aspect } });
}

/* Portrait, so it is bought for something a landscape panel cannot hold. Turned
 * inward like the side panels, and stood at the same eye line as the picture. */
const TOWER_H = MAIN_H * 0.76;
const TOWER_W = TOWER_H * (9 / 16);
const TOWER_X = PANEL_X + PANEL_W / 2 + 0.4 + TOWER_W / 2;
const TOWER_ROT: Vec3 = [0, -0.2, 0];
add({ name: "Bezel_Tower", geometry: box(TOWER_W + 0.16, TOWER_H + 0.16, 0.22), material: "Anodized", position: [TOWER_X, MAIN_Y, MAIN_Z - 0.12], rotation: TOWER_ROT, extras: { role: "metal" } });
add({ name: "Panel_Tower", geometry: plane(TOWER_W, TOWER_H), material: "Screen", position: [TOWER_X, MAIN_Y, MAIN_Z], rotation: TOWER_ROT, extras: { surface: true, aspect: "9:16" } });

/* A low plinth under the whole wall so the screens stand on something. */
add({ name: "Plinth", geometry: box(ROOM_W - 4, 0.55, 0.9), material: "BrushedMetal", position: [0, 0.275, BACK_Z + 0.45], extras: { role: "metal" } });

/* Cove light behind the top of the picture: the wall glows, the fixture never
 * appears in shot. */
add({ name: "Cove_Back", geometry: box(ROOM_W - 8, 0.05, 0.14), material: "Cove", position: [0, TOP_Y + TOP_H / 2 + 0.5, BACK_Z + 0.1], extras: { role: "light", intensity: 1 } });

/* --------------------------------------------------------------------- */
/*  GLB writer                                                             */
/* --------------------------------------------------------------------- */

function align(n: number): number {
  return Math.ceil(n / 4) * 4;
}

function buildGlb(): Buffer {
  const bufferViews: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const binParts: Buffer[] = [];
  let byteOffset = 0;

  const pushView = (data: ArrayBufferView, target: number): number => {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const padded = align(buf.length);
    const chunk = Buffer.alloc(padded);
    buf.copy(chunk);
    binParts.push(chunk);
    bufferViews.push({ buffer: 0, byteOffset, byteLength: buf.length, target });
    byteOffset += padded;
    return bufferViews.length - 1;
  };

  const pushAccessor = (view: number, componentType: number, count: number, type: string, minMax?: { min: number[]; max: number[] }): number => {
    accessors.push({ bufferView: view, componentType, count, type, ...(minMax ?? {}) });
    return accessors.length - 1;
  };

  const materialIndex = new Map(materials.map((m, i) => [m.name, i]));
  const gltfMaterials = materials.map((m) => ({
    name: m.name,
    pbrMetallicRoughness: { baseColorFactor: [...m.color, m.alpha ?? 1], metallicFactor: m.metallic, roughnessFactor: m.roughness },
    emissiveFactor: m.emissive ?? [0, 0, 0],
    alphaMode: m.alpha !== undefined && m.alpha < 1 ? "BLEND" : "OPAQUE",
    doubleSided: m.doubleSided ?? false,
  }));

  const gltfMeshes: Array<Record<string, unknown>> = [];
  const nodes: Array<Record<string, unknown>> = [];

  for (const def of meshes) {
    const geo = def.geometry.index ? def.geometry : def.geometry;
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const nor = geo.getAttribute("normal") as THREE.BufferAttribute;
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    const index = geo.getIndex();

    const posArr = new Float32Array(pos.array as Float32Array);
    const norArr = new Float32Array(nor.array as Float32Array);
    const uvArr = new Float32Array(uv.array as Float32Array);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < posArr.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], posArr[i + k]);
        max[k] = Math.max(max[k], posArr[i + k]);
      }
    }
    const posAcc = pushAccessor(pushView(posArr, 34962), 5126, pos.count, "VEC3", { min, max });
    const norAcc = pushAccessor(pushView(norArr, 34962), 5126, nor.count, "VEC3");
    const uvAcc = pushAccessor(pushView(uvArr, 34962), 5126, uv.count, "VEC2");

    const primitive: Record<string, unknown> = { attributes: { POSITION: posAcc, NORMAL: norAcc, TEXCOORD_0: uvAcc }, material: materialIndex.get(def.material), mode: 4 };
    if (index) {
      const useShort = pos.count < 65535;
      const arr = useShort ? new Uint16Array(index.array as ArrayLike<number>) : new Uint32Array(index.array as ArrayLike<number>);
      primitive.indices = pushAccessor(pushView(arr, 34963), useShort ? 5123 : 5125, index.count, "SCALAR");
    }
    gltfMeshes.push({ name: def.name, primitives: [primitive] });

    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(def.rotation ?? [0, 0, 0])));
    nodes.push({
      name: def.name,
      mesh: gltfMeshes.length - 1,
      translation: def.position ?? [0, 0, 0],
      rotation: [q.x, q.y, q.z, q.w],
      scale: def.scale ?? [1, 1, 1],
      ...(def.extras ? { extras: def.extras } : {}),
    });
  }

  const bin = Buffer.concat(binParts);
  const json = {
    asset: { version: "2.0", generator: "AIRTIME studio builder" },
    scene: 0,
    scenes: [{ name: "Studio", nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes: gltfMeshes,
    materials: gltfMaterials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = align(jsonBuf.length) - jsonBuf.length;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonBuf, binHeader, bin]);
}

const out = path.join(process.cwd(), "public", "models", "studio.glb");
mkdirSync(path.dirname(out), { recursive: true });
const glb = buildGlb();
writeFileSync(out, glb);
const surfaces = meshes.filter((m) => m.extras?.surface).map((m) => m.name);
writeFileSync(path.join(process.cwd(), "public", "models", "studio.meshes.json"), JSON.stringify({ meshes: meshes.map((m) => m.name), surfaces }, null, 2));
console.log(`wrote ${out} (${(glb.length / 1024).toFixed(1)} KB), ${meshes.length} meshes, ${surfaces.length} surfaces`);
