import * as THREE from "three";

/**
 * Procedural PBR materials for the auditorium.
 *
 * The room has almost nothing in it, so the little that shows has to look like
 * real material. These are generated on a canvas at load — colour, roughness
 * and a normal map derived from the same height field — rather than shipped as
 * image files: nothing to license, nothing to download, and they stay sharp at
 * any screen size.
 *
 * Everything is cached: the maps are built once per page, not per mesh.
 */

const TEX = 1024;

/* -------------------------------------------------------------------------- */
/*  Noise                                                                     */
/* -------------------------------------------------------------------------- */

function makeHash(seed: number) {
  return (x: number, y: number): number => {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453;
    return n - Math.floor(n);
  };
}

function makeValueNoise(seed: number) {
  const hash = makeHash(seed);
  return (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    // Smoothstep the cell coordinates so the field has no visible grid.
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves = 5): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise(x * frequency, y * frequency);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}

/* -------------------------------------------------------------------------- */
/*  Map builders                                                              */
/* -------------------------------------------------------------------------- */

function canvasTexture(data: Uint8ClampedArray, size: number, srgb: boolean, repeat: [number, number]): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // Write through the context's own buffer: ImageData's constructor is fussy
  // about which ArrayBuffer flavour a typed array is backed by.
  const image = ctx.createImageData(size, size);
  image.data.set(data);
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Sobel the height field into a tangent-space normal map. */
function normalFromHeight(height: Float32Array, size: number, strength: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // Normalise (-dx, -dy, 1) into 0..255.
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      out[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      out[i + 3] = 255;
    }
  }
  return out;
}

export interface SurfaceMaps {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
  normalMap: THREE.Texture;
}

/**
 * Dark polished marble: a charcoal ground with fine mineral veining, cut by a
 * few brighter fractures. Veins sit slightly proud and read rougher than the
 * polish around them, which is what makes the reflection break up believably.
 */
function buildMarble(): SurfaceMaps {
  const size = TEX;
  const noise = makeValueNoise(11.7);
  const colour = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 6;
      const v = (y / size) * 6;
      const turbulence = fbm(noise, u, v, 6);
      // Classic marble: a warped sine banding produces long, sweeping veins.
      const band = Math.sin((u * 1.6 + v * 0.7 + turbulence * 5.5) * Math.PI);
      const vein = Math.pow(1 - Math.abs(band), 14);
      const hairline = Math.pow(1 - Math.abs(Math.sin((v * 5.1 - u * 2.3 + turbulence * 9) * Math.PI)), 34);
      const grain = fbm(noise, u * 22, v * 22, 3);

      const base = 0.055 + grain * 0.018;
      const lift = vein * 0.42 + hairline * 0.6;
      const r = Math.min(1, base + lift * 0.9);
      const g = Math.min(1, base + lift * 0.94);
      const b = Math.min(1, base * 1.08 + lift);

      const i = (y * size + x) * 4;
      colour[i] = r * 255;
      colour[i + 1] = g * 255;
      colour[i + 2] = b * 255;
      colour[i + 3] = 255;

      // Polished stone is very smooth; the veins and grain break it up a little.
      const roughness = 0.09 + vein * 0.16 + hairline * 0.2 + grain * 0.06;
      rough[i] = rough[i + 1] = rough[i + 2] = Math.min(1, roughness) * 255;
      rough[i + 3] = 255;

      height[y * size + x] = vein * 0.55 + hairline * 0.8 + grain * 0.12;
    }
  }

  return {
    map: canvasTexture(colour, size, true, [4, 4]),
    roughnessMap: canvasTexture(rough, size, false, [4, 4]),
    normalMap: canvasTexture(normalFromHeight(height, size, 1.4), size, false, [4, 4]),
  };
}

/**
 * Brushed architectural metal panelling: a fine vertical grain, a wide satin
 * variation across each panel and a dark seam every panel width.
 */
function buildBrushedMetal(): SurfaceMaps {
  const size = TEX;
  const noise = makeValueNoise(4.31);
  const colour = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Grain runs vertically: high frequency across, very low along.
      const grain = fbm(noise, u * 420, v * 3, 3);
      const satin = fbm(noise, u * 5, v * 5, 4);
      // A seam every eighth of the map, with a soft shadow either side.
      const seamPhase = Math.abs(((u * 8) % 1) - 0.5) * 2;
      const seam = Math.pow(1 - seamPhase, 26);

      const base = 0.085 + satin * 0.05 + grain * 0.035 - seam * 0.06;
      const i = (y * size + x) * 4;
      colour[i] = Math.max(0, base * 0.96) * 255;
      colour[i + 1] = Math.max(0, base) * 255;
      colour[i + 2] = Math.max(0, base * 1.09) * 255;
      colour[i + 3] = 255;

      const roughness = 0.3 + grain * 0.24 + satin * 0.1 + seam * 0.25;
      rough[i] = rough[i + 1] = rough[i + 2] = Math.min(1, roughness) * 255;
      rough[i + 3] = 255;

      height[y * size + x] = grain * 0.35 + satin * 0.1 - seam * 1.2;
    }
  }

  return {
    map: canvasTexture(colour, size, true, [3, 2]),
    roughnessMap: canvasTexture(rough, size, false, [3, 2]),
    normalMap: canvasTexture(normalFromHeight(height, size, 2.6), size, false, [3, 2]),
  };
}

/** Fine machined aluminium for the bezel and plinth: tight grain, low variation. */
function buildMachinedMetal(): SurfaceMaps {
  const size = 512;
  const noise = makeValueNoise(88.2);
  const colour = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const grain = fbm(noise, u * 6, v * 300, 2);
      const base = 0.16 + grain * 0.06;
      const i = (y * size + x) * 4;
      colour[i] = base * 0.97 * 255;
      colour[i + 1] = base * 255;
      colour[i + 2] = base * 1.06 * 255;
      colour[i + 3] = 255;
      const roughness = 0.22 + grain * 0.2;
      rough[i] = rough[i + 1] = rough[i + 2] = roughness * 255;
      rough[i + 3] = 255;
      height[y * size + x] = grain * 0.4;
    }
  }
  return {
    map: canvasTexture(colour, size, true, [6, 1]),
    roughnessMap: canvasTexture(rough, size, false, [6, 1]),
    normalMap: canvasTexture(normalFromHeight(height, size, 1.1), size, false, [6, 1]),
  };
}

/** Acoustic ceiling: matte, finely stippled, almost no reflection. */
function buildCeiling(): SurfaceMaps {
  const size = 512;
  const noise = makeValueNoise(59.9);
  const colour = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const stipple = fbm(noise, u * 160, v * 160, 2);
      const base = 0.03 + stipple * 0.016;
      const i = (y * size + x) * 4;
      colour[i] = colour[i + 1] = base * 255;
      colour[i + 2] = base * 1.1 * 255;
      colour[i + 3] = 255;
      rough[i] = rough[i + 1] = rough[i + 2] = (0.86 + stipple * 0.12) * 255;
      rough[i + 3] = 255;
      height[y * size + x] = stipple * 0.5;
    }
  }
  return {
    map: canvasTexture(colour, size, true, [8, 8]),
    roughnessMap: canvasTexture(rough, size, false, [8, 8]),
    normalMap: canvasTexture(normalFromHeight(height, size, 0.8), size, false, [8, 8]),
  };
}

/* -------------------------------------------------------------------------- */
/*  Cache                                                                     */
/* -------------------------------------------------------------------------- */

let cache: Record<"marble" | "metal" | "machined" | "ceiling", SurfaceMaps> | null = null;

export function surfaceMaps(): Record<"marble" | "metal" | "machined" | "ceiling", SurfaceMaps> {
  if (!cache) {
    cache = {
      marble: buildMarble(),
      metal: buildBrushedMetal(),
      machined: buildMachinedMetal(),
      ceiling: buildCeiling(),
    };
  }
  return cache;
}

/** Polished marble floor. Clearcoat gives it the wet look of a sealed stone. */
export function marbleMaterial(): THREE.MeshPhysicalMaterial {
  const m = surfaceMaps().marble;
  return new THREE.MeshPhysicalMaterial({
    map: m.map,
    roughnessMap: m.roughnessMap,
    normalMap: m.normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
    color: new THREE.Color("#ffffff"),
    metalness: 0.12,
    roughness: 1,
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.5,
  });
}

export function wallMaterial(): THREE.MeshStandardMaterial {
  const m = surfaceMaps().metal;
  return new THREE.MeshStandardMaterial({
    map: m.map,
    roughnessMap: m.roughnessMap,
    normalMap: m.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    metalness: 0.88,
    roughness: 1,
    envMapIntensity: 1.15,
  });
}

export function machinedMaterial(): THREE.MeshStandardMaterial {
  const m = surfaceMaps().machined;
  return new THREE.MeshStandardMaterial({
    map: m.map,
    roughnessMap: m.roughnessMap,
    normalMap: m.normalMap,
    normalScale: new THREE.Vector2(0.4, 0.4),
    metalness: 0.96,
    roughness: 1,
    envMapIntensity: 1.4,
  });
}

export function ceilingMaterial(): THREE.MeshStandardMaterial {
  const m = surfaceMaps().ceiling;
  return new THREE.MeshStandardMaterial({
    map: m.map,
    roughnessMap: m.roughnessMap,
    normalMap: m.normalMap,
    normalScale: new THREE.Vector2(0.25, 0.25),
    metalness: 0.05,
    roughness: 1,
    envMapIntensity: 0.5,
  });
}
