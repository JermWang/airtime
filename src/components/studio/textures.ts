"use client";

import * as THREE from "three";

/**
 * Texture factories for surfaces in the studio. Every texture created here is
 * owned by the caller and must be disposed via `dispose()` when replaced.
 */

export interface SurfaceTexture {
  texture: THREE.Texture;
  aspect: number;
  kind: "image" | "video" | "canvas";
  dispose: () => void;
  /** For video: pause/resume when the surface leaves view. */
  setActive?: (active: boolean) => void;
}

function parseAspect(aspect: string): number {
  const [w, h] = aspect.split(":").map(Number);
  return w && h ? w / h : 16 / 9;
}

/** Apply FIT/FILL by adjusting texture repeat/offset for a surface of `surfaceAspect`. */
export function applyFit(texture: THREE.Texture, mediaAspect: number, surfaceAspect: number, fit: "FIT" | "FILL"): void {
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  const ratio = mediaAspect / surfaceAspect; // >1 media wider than surface
  if (fit === "FILL") {
    if (ratio > 1) {
      texture.repeat.set(1 / ratio, 1);
      texture.offset.set((1 - 1 / ratio) / 2, 0);
    } else {
      texture.repeat.set(1, ratio);
      texture.offset.set(0, (1 - ratio) / 2);
    }
  } else {
    // FIT: letterbox; the uncovered area is clamped edge pixels, so we bake bars into
    // a canvas for images/text (see fitOnCanvas). For video we accept edge stretch-free
    // clamping by using repeat > 1 with a black border via material color.
    if (ratio > 1) {
      texture.repeat.set(1, ratio);
      texture.offset.set(0, (1 - ratio) / 2);
    } else {
      texture.repeat.set(1 / ratio, 1);
      texture.offset.set((1 - 1 / ratio) / 2, 0);
    }
  }
  texture.needsUpdate = true;
}

export function loadImageTexture(url: string, surfaceAspect: string, fit: "FIT" | "FILL"): Promise<SurfaceTexture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const sa = parseAspect(surfaceAspect);
      const ma = img.naturalWidth / img.naturalHeight;
      // Bake FIT letterboxing into a canvas so bars are true black instead of clamped edges.
      const W = Math.min(2048, Math.max(512, img.naturalWidth));
      const H = Math.round(W / sa);
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      let dw: number;
      let dh: number;
      if (fit === "FILL" ? ma > sa : ma < sa) {
        dh = H;
        dw = H * ma;
      } else {
        dw = W;
        dh = W / ma;
      }
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      resolve({ texture, aspect: sa, kind: "image", dispose: () => texture.dispose() });
    };
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

export function createVideoTexture(url: string, surfaceAspect: string, fit: "FIT" | "FILL", opts: { loop?: boolean; muted?: boolean; offsetSec?: number } = {}): SurfaceTexture {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.muted = opts.muted ?? true;
  video.loop = opts.loop ?? true;
  video.preload = "auto";
  video.src = url;
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const sa = parseAspect(surfaceAspect);
  video.addEventListener(
    "loadedmetadata",
    () => {
      const ma = video.videoWidth / Math.max(1, video.videoHeight);
      applyFit(texture, ma, sa, fit);
      if (opts.offsetSec && Number.isFinite(video.duration)) video.currentTime = opts.offsetSec % video.duration;
      void video.play().catch(() => {});
    },
    { once: true },
  );
  return {
    texture,
    aspect: sa,
    kind: "video",
    dispose: () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      texture.dispose();
    },
    setActive: (active) => {
      if (active) void video.play().catch(() => {});
      else video.pause();
    },
  };
}

/** Video texture from an existing playing element (the station player). */
export function textureFromVideoElement(video: HTMLVideoElement): THREE.VideoTexture {
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

interface HouseOptions {
  label?: string;
  sublabel?: string;
  aspect: string;
  variant?: "billboard" | "ribbon" | "monitor" | "slate";
  seed?: number;
}

/** Procedural AIRTIME house graphic for unsold surfaces (no fake ads, ever). */
export function createHouseTexture(opts: HouseOptions): SurfaceTexture {
  const sa = parseAspect(opts.aspect);
  const W = sa >= 8 ? 2048 : 1024;
  const H = Math.max(64, Math.round(W / sa));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0b0d10");
  g.addColorStop(1, "#111418");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Fine grid – reads as an LED wall up close.
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  const step = Math.max(16, Math.round(W / 64));
  for (let x = 0; x < W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  const unit = Math.min(W, H);
  const barW = Math.max(3, unit * 0.035);
  const fontSize = opts.variant === "ribbon" ? H * 0.5 : unit * 0.11;
  ctx.fillStyle = "#ccff00";
  ctx.shadowColor = "rgba(204, 255, 0,0.6)";
  ctx.shadowBlur = unit * 0.05;
  const textX = W * 0.06;
  const textY = H / 2;
  ctx.fillRect(textX, textY - fontSize * 0.55, barW, fontSize * 1.1);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#f2f4f7";
  ctx.font = `600 ${fontSize}px "Inter Tight", Inter, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.letterSpacing = `${fontSize * 0.22}px`;
  ctx.fillText((opts.label ?? "AIRTIME").toUpperCase(), textX + barW * 2.6, textY);
  if (opts.sublabel && opts.variant !== "ribbon") {
    ctx.fillStyle = "rgba(185,193,204,0.9)";
    ctx.font = `500 ${fontSize * 0.34}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.letterSpacing = `${fontSize * 0.08}px`;
    ctx.fillText(opts.sublabel.toUpperCase(), textX + barW * 2.6, textY + fontSize * 0.85);
  }
  if (opts.variant !== "ribbon") {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = `500 ${fontSize * 0.28}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.letterSpacing = `${fontSize * 0.1}px`;
    ctx.textAlign = "right";
    ctx.fillText("AVAILABLE AIRTIME", W * 0.94, H * 0.9);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, aspect: sa, kind: "canvas", dispose: () => texture.dispose() };
}

/** Scrolling text ribbon texture (ticker). Call `update(t)` each frame. */
export function createTickerTexture(text: string, aspect: string): SurfaceTexture & { update: (dt: number) => void } {
  const sa = parseAspect(aspect);
  const W = 4096;
  const H = Math.max(64, Math.round(W / sa));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const font = `600 ${H * 0.62}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.font = font;
  ctx.letterSpacing = `${H * 0.08}px`;
  const content = `${text.toUpperCase()}     •     `;
  const textW = ctx.measureText(content).width;
  let scroll = 0;
  const draw = () => {
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, W, H);
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ccff00";
    let x = -scroll;
    while (x < W) {
      ctx.fillText(content, x, H / 2);
      x += textW;
    }
  };
  draw();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return {
    texture,
    aspect: sa,
    kind: "canvas",
    dispose: () => texture.dispose(),
    update: (dt: number) => {
      scroll = (scroll + dt * H * 1.6) % textW;
      draw();
      texture.needsUpdate = true;
    },
  };
}

export interface ShowcaseCard {
  label: string;
  headline: string;
  sublabel?: string | null;
  accent: string;
}

/**
 * House showcase card for an unbooked surface. Drawn from text only – no
 * third-party artwork – and always stamped EXAMPLE so it cannot be mistaken for
 * a paid campaign.
 */
export function createShowcaseTexture(card: ShowcaseCard, aspect: string): SurfaceTexture {
  const sa = parseAspect(aspect);
  const W = sa >= 8 ? 2048 : 1280;
  const H = Math.max(80, Math.round(W / sa));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#07090c");
  g.addColorStop(1, "#12161b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // LED grain
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  const step = Math.max(14, Math.round(W / 72));
  for (let x = 0; x < W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  const pad = W * 0.06;
  const unit = Math.min(W, H);
  const accent = card.accent || "#ccff00";

  // Accent rule
  ctx.fillStyle = accent;
  ctx.fillRect(pad, H * 0.22, Math.max(3, unit * 0.02), H * 0.56);

  const textX = pad + Math.max(3, unit * 0.02) + W * 0.03;
  const headSize = Math.min(unit * 0.16, H * 0.3);

  ctx.fillStyle = accent;
  ctx.font = `500 ${headSize * 0.38}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.letterSpacing = `${headSize * 0.14}px`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(card.label.toUpperCase(), textX, H * 0.32);

  ctx.fillStyle = "#f4f6f8";
  ctx.font = `600 ${headSize}px "Inter Tight", Inter, system-ui, sans-serif`;
  ctx.letterSpacing = `${headSize * 0.01}px`;
  ctx.fillText(card.headline, textX, H * 0.56);

  if (card.sublabel) {
    ctx.fillStyle = "rgba(185,193,204,0.85)";
    ctx.font = `500 ${headSize * 0.32}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.letterSpacing = `${headSize * 0.06}px`;
    ctx.fillText(card.sublabel.toUpperCase(), textX, H * 0.74);
  }

  // EXAMPLE badge – permanent, so a showcase card is never mistaken for a sold spot.
  const badge = "EXAMPLE";
  const badgeSize = Math.max(10, headSize * 0.26);
  ctx.font = `600 ${badgeSize}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.letterSpacing = `${badgeSize * 0.2}px`;
  const bw = ctx.measureText(badge).width + badgeSize * 1.6;
  const bh = badgeSize * 2.1;
  const bx = W - pad - bw;
  const by = H * 0.16 - bh / 2;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = Math.max(1, badgeSize * 0.08);
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = "rgba(240,244,248,0.92)";
  ctx.textBaseline = "middle";
  ctx.fillText(badge, bx + badgeSize * 0.8, by + bh / 2);

  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.font = `500 ${badgeSize}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = "right";
  ctx.fillText("THIS SPACE IS AVAILABLE", W - pad, H * 0.88);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, aspect: sa, kind: "canvas", dispose: () => texture.dispose() };
}

export function createSlateTexture(title: string, subtitle: string): SurfaceTexture {
  return createHouseTexture({ label: title, sublabel: subtitle, aspect: "16:9", variant: "slate" });
}

export { parseAspect };
