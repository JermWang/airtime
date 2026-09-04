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

/** Same stack the page uses, so canvas type matches DOM type. */
const SANS = '"Helvetica Now Display", "HelveticaNowDisplay", "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';

/**
 * Shrink a font size until the text fits in maxWidth, then wrap into at most
 * maxLines lines. Returns the lines and the size that was used. Long headlines
 * on a 16:9 billboard, or anything on a portrait panel, would otherwise run off
 * the canvas.
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: { weight: number; family: string; size: number; minSize: number; maxWidth: number; maxLines: number; letterSpacing?: number },
): { lines: string[]; size: number } {
  const words = text.split(/\s+/).filter(Boolean);
  const setFont = (size: number) => {
    ctx.font = `${opts.weight} ${size}px ${opts.family}`;
    ctx.letterSpacing = `${(opts.letterSpacing ?? 0) * size}px`;
  };
  const wrap = (size: number): string[] | null => {
    setFont(size);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (ctx.measureText(candidate).width <= opts.maxWidth) {
        line = candidate;
      } else {
        if (!line) return null; // a single word is wider than the box at this size
        lines.push(line);
        line = w;
        if (lines.length > opts.maxLines) return null;
      }
    }
    if (line) lines.push(line);
    return lines.length <= opts.maxLines ? lines : null;
  };
  for (let size = opts.size; size >= opts.minSize; size = Math.floor(size * 0.92)) {
    const lines = wrap(size);
    if (lines) return { lines, size };
  }
  setFont(opts.minSize);
  return { lines: wrap(opts.minSize) ?? [text], size: opts.minSize };
}

function paintLedBackdrop(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#07090c");
  g.addColorStop(1, "#12161b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  const step = Math.max(14, Math.round(W / 72));
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
}

/** Procedural AIRTIME house graphic for unsold surfaces (no fake ads, ever). */
export function createHouseTexture(opts: HouseOptions): SurfaceTexture {
  const sa = parseAspect(opts.aspect);
  const W = sa >= 8 ? 2048 : sa < 1 ? 720 : 1280;
  const H = Math.max(64, Math.round(W / sa));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  paintLedBackdrop(ctx, W, H);

  const pad = Math.round(Math.min(W, H) * 0.08);
  const inner = W - pad * 2;
  const unit = Math.min(W, H);
  const barW = Math.max(3, Math.round(unit * 0.035));
  const textX = pad + barW * 2.2;
  const maxW = W - pad - textX;

  if (opts.variant === "ribbon") {
    const { lines, size } = fitText(ctx, (opts.label ?? "AIRTIME").toUpperCase(), { weight: 600, family: SANS, size: H * 0.55, minSize: 12, maxWidth: inner - barW * 3, maxLines: 1, letterSpacing: 0.18 });
    ctx.fillStyle = "#ccff00";
    ctx.fillRect(pad, H * 0.25, barW, H * 0.5);
    ctx.fillStyle = "#f2f4f7";
    ctx.textBaseline = "middle";
    ctx.fillText(lines[0], textX, H / 2 + size * 0.04);
  } else {
    const label = (opts.label ?? "AIRTIME").toUpperCase();
    const head = fitText(ctx, label, { weight: 600, family: SANS, size: unit * 0.13, minSize: 14, maxWidth: maxW, maxLines: 2, letterSpacing: 0.16 });
    const lineH = head.size * 1.12;
    const sub = opts.sublabel ? fitText(ctx, opts.sublabel.toUpperCase(), { weight: 500, family: MONO, size: head.size * 0.34, minSize: 9, maxWidth: maxW, maxLines: 2, letterSpacing: 0.08 }) : null;
    const blockH = head.lines.length * lineH + (sub ? sub.lines.length * sub.size * 1.4 + head.size * 0.35 : 0);
    let y = H / 2 - blockH / 2;

    ctx.fillStyle = "#ccff00";
    ctx.shadowColor = "rgba(204, 255, 0, 0.55)";
    ctx.shadowBlur = unit * 0.04;
    ctx.fillRect(pad, y, barW, blockH);
    ctx.shadowBlur = 0;

    ctx.textBaseline = "top";
    ctx.fillStyle = "#f2f4f7";
    ctx.font = `600 ${head.size}px ${SANS}`;
    ctx.letterSpacing = `${0.16 * head.size}px`;
    for (const line of head.lines) {
      ctx.fillText(line, textX, y);
      y += lineH;
    }
    if (sub) {
      y += head.size * 0.35;
      ctx.fillStyle = "rgba(185,193,204,0.9)";
      ctx.font = `500 ${sub.size}px ${MONO}`;
      ctx.letterSpacing = `${0.08 * sub.size}px`;
      for (const line of sub.lines) {
        ctx.fillText(line, textX, y);
        y += sub.size * 1.4;
      }
    }

    const foot = fitText(ctx, "AVAILABLE AIRTIME", { weight: 500, family: MONO, size: Math.max(9, head.size * 0.26), minSize: 8, maxWidth: inner, maxLines: 1, letterSpacing: 0.12 });
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(foot.lines[0], W - pad, H - pad * 0.6);
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
  const font = `600 ${H * 0.62}px ${MONO}`;
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
 * Draw one showcase card into a rectangle of the canvas. Used once for a
 * normal surface, and once per wing on ultra-wide surfaces whose middle sits
 * behind the main display.
 */
function paintShowcaseCard(ctx: CanvasRenderingContext2D, card: ShowcaseCard, x0: number, y0: number, w: number, h: number, badge: boolean): void {
  const unit = Math.min(w, h);
  const pad = Math.round(unit * 0.09);
  const accent = card.accent || "#ccff00";
  const barW = Math.max(3, Math.round(unit * 0.022));
  const textX = x0 + pad + barW + Math.round(unit * 0.05);
  const maxW = x0 + w - pad - textX;

  const label = fitText(ctx, card.label.toUpperCase(), { weight: 500, family: MONO, size: unit * 0.05, minSize: 9, maxWidth: maxW, maxLines: 1, letterSpacing: 0.16 });
  const head = fitText(ctx, card.headline, { weight: 600, family: SANS, size: unit * 0.16, minSize: 16, maxWidth: maxW, maxLines: 3, letterSpacing: -0.02 });
  const sub = card.sublabel ? fitText(ctx, card.sublabel.toUpperCase(), { weight: 500, family: MONO, size: unit * 0.042, minSize: 9, maxWidth: maxW, maxLines: 2, letterSpacing: 0.08 }) : null;

  const headLine = head.size * 1.08;
  const blockH = label.size * 1.9 + head.lines.length * headLine + (sub ? head.size * 0.3 + sub.lines.length * sub.size * 1.45 : 0);
  let y = y0 + h / 2 - blockH / 2;

  ctx.fillStyle = accent;
  ctx.fillRect(x0 + pad, y, barW, blockH);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = accent;
  ctx.font = `500 ${label.size}px ${MONO}`;
  ctx.letterSpacing = `${0.16 * label.size}px`;
  ctx.fillText(label.lines[0], textX, y);
  y += label.size * 1.9;

  ctx.fillStyle = "#f4f6f8";
  ctx.font = `600 ${head.size}px ${SANS}`;
  ctx.letterSpacing = `${-0.02 * head.size}px`;
  for (const line of head.lines) {
    ctx.fillText(line, textX, y);
    y += headLine;
  }

  if (sub) {
    y += head.size * 0.3;
    ctx.fillStyle = "rgba(185,193,204,0.85)";
    ctx.font = `500 ${sub.size}px ${MONO}`;
    ctx.letterSpacing = `${0.08 * sub.size}px`;
    for (const line of sub.lines) {
      ctx.fillText(line, textX, y);
      y += sub.size * 1.45;
    }
  }

  if (badge) {
    // EXAMPLE badge: permanent, so a showcase card is never mistaken for a sold spot.
    const badgeSize = Math.max(9, Math.round(unit * 0.036));
    ctx.font = `600 ${badgeSize}px ${MONO}`;
    ctx.letterSpacing = `${badgeSize * 0.2}px`;
    const text = "EXAMPLE";
    const bw = ctx.measureText(text).width + badgeSize * 1.8;
    const bh = badgeSize * 2.1;
    const bx = x0 + w - pad - bw;
    const by = y0 + pad;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = Math.max(1, badgeSize * 0.08);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = "rgba(240,244,248,0.92)";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(text, bx + badgeSize * 0.9, by + bh / 2);

    const foot = fitText(ctx, "THIS SPACE IS AVAILABLE", { weight: 500, family: MONO, size: badgeSize, minSize: 8, maxWidth: w - pad * 2, maxLines: 1, letterSpacing: 0.12 });
    ctx.fillStyle = "rgba(255,255,255,0.32)";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(foot.lines[0], x0 + w - pad, y0 + h - pad * 0.7);
  }
}

/**
 * House showcase card for an unbooked surface. Drawn from text only, no
 * third-party artwork, and always stamped EXAMPLE so it cannot be mistaken for
 * a paid campaign.
 *
 * Layout follows the surface: portrait panels stack, and ultra-wide walls
 * (3:1 and wider, i.e. the rear LED wall whose centre is behind the main
 * display) paint the card on both wings and leave the middle quiet.
 */
export function createShowcaseTexture(card: ShowcaseCard, aspect: string): SurfaceTexture {
  const sa = parseAspect(aspect);
  const W = sa >= 3 ? 2560 : sa < 1 ? 720 : 1280;
  const H = Math.max(80, Math.round(W / sa));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  paintLedBackdrop(ctx, W, H);

  if (sa >= 3) {
    // Wings. From the room, the rear wall is hidden in the middle by the main
    // display and at the far edges by the angled side walls, so the band that
    // actually reads is roughly 7%–26% of the width on each side. The cards
    // are laid out inside that band and wrap to fit it.
    const inset = Math.round(W * 0.07);
    const wing = Math.round(W * 0.19);
    paintShowcaseCard(ctx, card, inset, 0, wing, H, true);
    paintShowcaseCard(ctx, card, W - inset - wing, 0, wing, H, true);
  } else {
    paintShowcaseCard(ctx, card, 0, 0, W, H, true);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, aspect: sa, kind: "canvas", dispose: () => texture.dispose() };
}

export function createSlateTexture(title: string, subtitle: string): SurfaceTexture {
  return createHouseTexture({ label: title, sublabel: subtitle, aspect: "16:9", variant: "slate" });
}

export { parseAspect };
