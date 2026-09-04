/**
 * Builds public/models/studio.glb – the AIRTIME broadcast studio.
 *
 * The studio is authored procedurally (no external DCC asset) but exported as a
 * real, standard glTF binary so the runtime is purely GLTF-driven: meshes are
 * addressed by name (Screen_Main, Billboard_Left, Monitor_Rear, LED_Ribbon …)
 * and any of them can be mapped to a placement from the control room.
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
  { name: "Graphite", color: [0.075, 0.08, 0.088], metallic: 0.15, roughness: 0.62 },
  { name: "GraphitePanel", color: [0.105, 0.112, 0.122], metallic: 0.28, roughness: 0.5 },
  { name: "Anodized", color: [0.055, 0.058, 0.063], metallic: 0.92, roughness: 0.3 },
  { name: "BrushedMetal", color: [0.28, 0.29, 0.3], metallic: 0.95, roughness: 0.42 },
  { name: "Floor", color: [0.05, 0.052, 0.056], metallic: 0.35, roughness: 0.22 },
  { name: "Screen", color: [0.01, 0.01, 0.012], metallic: 0.0, roughness: 0.35, emissive: [0, 0, 0] },
  { name: "Glass", color: [0.6, 0.7, 0.75], metallic: 0.0, roughness: 0.05, alpha: 0.18, doubleSided: true },
  { name: "Cove", color: [1, 1, 1], metallic: 0, roughness: 1, emissive: [0.78, 0.83, 0.9] },
  { name: "Signal", color: [0.80, 1.0, 0.0], metallic: 0, roughness: 1, emissive: [0.80, 1.0, 0.0] },
  { name: "Lamp", color: [1, 0.97, 0.9], metallic: 0, roughness: 1, emissive: [0.95, 0.92, 0.85] },
];

const meshes: MeshDef[] = [];

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const plane = (w: number, h: number) => new THREE.PlaneGeometry(w, h);

function add(def: MeshDef) {
  meshes.push(def);
}

/* --------------------------------------------------------------------- */
/*  Architecture                                                          */
/* --------------------------------------------------------------------- */

const ROOM_W = 30;
const ROOM_D = 22;
const ROOM_H = 10;
const BACK_Z = -8;

add({ name: "Floor", geometry: plane(ROOM_W, ROOM_D), material: "Floor", position: [0, 0, -1], rotation: [-Math.PI / 2, 0, 0], extras: { role: "floor" } });
add({ name: "Ceiling", geometry: plane(ROOM_W, ROOM_D), material: "Graphite", position: [0, ROOM_H, -1], rotation: [Math.PI / 2, 0, 0] });
add({ name: "Wall_Back", geometry: plane(ROOM_W, ROOM_H), material: "GraphitePanel", position: [0, ROOM_H / 2, BACK_Z], extras: { role: "wall" } });
add({ name: "Wall_Left", geometry: plane(ROOM_D, ROOM_H), material: "GraphitePanel", position: [-ROOM_W / 2, ROOM_H / 2, -1], rotation: [0, Math.PI / 2, 0] });
add({ name: "Wall_Right", geometry: plane(ROOM_D, ROOM_H), material: "GraphitePanel", position: [ROOM_W / 2, ROOM_H / 2, -1], rotation: [0, -Math.PI / 2, 0] });

// Vertical pilasters on the back wall give the architecture rhythm and catch light.
for (let i = -6; i <= 6; i++) {
  if (Math.abs(i) < 2) continue;
  add({ name: `Pilaster_${i + 6}`, geometry: box(0.22, ROOM_H, 0.35), material: "Anodized", position: [i * 2.2, ROOM_H / 2, BACK_Z + 0.18] });
}

// Recessed ceiling coves (emissive strips) – the studio's key architectural light.
for (let i = 0; i < 5; i++) {
  const z = -7 + i * 3;
  add({ name: `Cove_${i}`, geometry: box(18, 0.04, 0.16), material: "Cove", position: [0, ROOM_H - 0.05, z], extras: { role: "light", intensity: 1.2 } });
}
// Signal-green accent line along the side walls.
add({ name: "Accent_Left", geometry: box(0.02, 0.03, ROOM_D - 4), material: "Signal", position: [-ROOM_W / 2 + 0.02, 6.4, -1], extras: { role: "accent" } });
add({ name: "Accent_Right", geometry: box(0.02, 0.03, ROOM_D - 4), material: "Signal", position: [ROOM_W / 2 - 0.02, 6.4, -1], extras: { role: "accent" } });

/* --------------------------------------------------------------------- */
/*  Rear LED wall (REAR_MONITOR) – full-width backdrop behind the desk      */
/* --------------------------------------------------------------------- */

const WALL_W = 19.2;
const WALL_H = 5.4;
add({ name: "Frame_Rear", geometry: box(WALL_W + 0.3, WALL_H + 0.3, 0.22), material: "Anodized", position: [0, 3.4, BACK_Z + 0.15] });
add({ name: "Monitor_Rear", geometry: plane(WALL_W, WALL_H), material: "Screen", position: [0, 3.4, BACK_Z + 0.27], extras: { surface: true, aspect: "32:9" } });

/* --------------------------------------------------------------------- */
/*  Main broadcast display – suspended in front of the LED wall            */
/* --------------------------------------------------------------------- */

const MAIN_W = 9.6;
const MAIN_H = 5.4;
const MAIN_Z = -6.4;
add({ name: "Frame_Main", geometry: box(MAIN_W + 0.24, MAIN_H + 0.24, 0.3), material: "Anodized", position: [0, 3.65, MAIN_Z - 0.16] });
add({ name: "Screen_Main", geometry: plane(MAIN_W, MAIN_H), material: "Screen", position: [0, 3.65, MAIN_Z], extras: { surface: true, aspect: "16:9", main: true } });
// Suspension rods
add({ name: "Rod_Main_L", geometry: box(0.05, ROOM_H - 6.4, 0.05), material: "BrushedMetal", position: [-3.2, (ROOM_H + 6.35) / 2, MAIN_Z - 0.16] });
add({ name: "Rod_Main_R", geometry: box(0.05, ROOM_H - 6.4, 0.05), material: "BrushedMetal", position: [3.2, (ROOM_H + 6.35) / 2, MAIN_Z - 0.16] });
// LED ticker ribbon under the main display
add({ name: "Frame_Ribbon", geometry: box(MAIN_W + 0.24, 0.5, 0.2), material: "Anodized", position: [0, 0.6, MAIN_Z - 0.12] });
add({ name: "LED_Ribbon", geometry: plane(MAIN_W, 0.3), material: "Screen", position: [0, 0.6, MAIN_Z], extras: { surface: true, aspect: "32:1" } });

/* --------------------------------------------------------------------- */
/*  Side billboards on angled wing walls                                   */
/* --------------------------------------------------------------------- */

const BB_W = 5.6;
const BB_H = 3.15;
const wing = (side: -1 | 1) => {
  const name = side < 0 ? "Left" : "Right";
  const x = side * 10.4;
  const z = -3.6;
  const rot: Vec3 = [0, -side * 0.62, 0];
  add({ name: `Wing_${name}`, geometry: box(7.2, ROOM_H - 0.4, 0.4), material: "GraphitePanel", position: [x, (ROOM_H - 0.4) / 2, z - 0.25], rotation: rot });
  add({ name: `Frame_${name}`, geometry: box(BB_W + 0.24, BB_H + 0.24, 0.16), material: "Anodized", position: [x, 3.3, z - 0.02], rotation: rot });
  add({ name: `Billboard_${name}`, geometry: plane(BB_W, BB_H), material: "Screen", position: [x, 3.3, z + 0.08], rotation: rot, extras: { surface: true, aspect: "16:9" } });
  // Small studio monitors stacked under each billboard
  for (let i = 0; i < 3; i++) {
    const t = -1.15 + i * 1.15;
    add({ name: `Monitor_${name}_${i + 1}`, geometry: plane(1.0, 0.5625), material: "Screen", position: [x + t * Math.cos(rot[1]), 1.05, z + 0.08 - t * Math.sin(rot[1])], rotation: rot, extras: { surface: true, aspect: "16:9", monitor: true } });
  }
};
wing(-1);
wing(1);

/* --------------------------------------------------------------------- */
/*  Anchor desk                                                            */
/* --------------------------------------------------------------------- */

const DESK_Z = -2.4;
add({ name: "Desk_Body", geometry: box(4.6, 1.05, 1.2), material: "Anodized", position: [0, 0.525, DESK_Z] });
add({ name: "Desk_Top", geometry: box(4.9, 0.06, 1.4), material: "BrushedMetal", position: [0, 1.08, DESK_Z] });
add({ name: "Desk_Display", geometry: plane(2.1, 0.9), material: "Screen", position: [0, 0.56, DESK_Z + 0.61], extras: { surface: true, aspect: "21:9" } });
add({ name: "Desk_Glass", geometry: plane(4.4, 0.7), material: "Glass", position: [0, 0.56, DESK_Z + 0.62], extras: { role: "glass" } });
// Desk monitors facing the anchor
for (let i = -1; i <= 1; i++) {
  add({ name: `Monitor_Desk_${i + 2}`, geometry: plane(0.6, 0.34), material: "Screen", position: [i * 0.75, 1.32, DESK_Z - 0.3], rotation: [-0.25, 0, 0], extras: { surface: true, aspect: "16:9", monitor: true } });
}

/* --------------------------------------------------------------------- */
/*  Control-room console (front left) – decorative, but every monitor is  */
/*  a named mesh an operator can map inventory onto.                       */
/* --------------------------------------------------------------------- */

add({ name: "Console_Body", geometry: box(4.2, 0.9, 0.9), material: "Anodized", position: [-7.4, 0.45, 2.6], rotation: [0, 0.55, 0] });
for (let i = 0; i < 4; i++) {
  const t = (i - 1.5) * 1.0;
  add({ name: `Monitor_CR_${i + 1}`, geometry: plane(0.86, 0.484), material: "Screen", position: [-7.4 + t * Math.cos(0.55), 1.25, 2.6 - t * Math.sin(0.55) - 0.35], rotation: [-0.2, 0.55, 0], extras: { surface: true, aspect: "16:9", monitor: true } });
}

/* --------------------------------------------------------------------- */
/*  Lighting truss and lamp heads (visual)                                 */
/* --------------------------------------------------------------------- */

add({ name: "Truss_Front", geometry: box(20, 0.12, 0.12), material: "BrushedMetal", position: [0, 8.2, 1.5] });
add({ name: "Truss_Mid", geometry: box(20, 0.12, 0.12), material: "BrushedMetal", position: [0, 8.2, -3.5] });
for (let i = -3; i <= 3; i++) {
  add({ name: `Lamp_F_${i + 3}`, geometry: new THREE.CylinderGeometry(0.16, 0.22, 0.34, 16), material: "Anodized", position: [i * 2.8, 7.9, 1.5], rotation: [0.6, 0, 0] });
  add({ name: `LampFace_F_${i + 3}`, geometry: new THREE.CircleGeometry(0.15, 16), material: "Lamp", position: [i * 2.8, 7.74, 1.4], rotation: [-Math.PI / 2 + 0.6, 0, 0], extras: { role: "lamp" } });
}

/* --------------------------------------------------------------------- */
/*  Floating glass product pedestal (right-front)                          */
/* --------------------------------------------------------------------- */

add({ name: "Pedestal", geometry: new THREE.CylinderGeometry(0.55, 0.6, 1.1, 32), material: "Anodized", position: [5.8, 0.55, 0.8] });
add({ name: "Pedestal_Glass", geometry: new THREE.CylinderGeometry(0.52, 0.52, 0.9, 32, 1, true), material: "Glass", position: [5.8, 1.6, 0.8], extras: { role: "glass" } });

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
