/**
 * Builds public/panels/*.webp — the artwork behind the front of each panel.
 *
 * Two stages, because each does what it is good at:
 *
 *   1. The *content* is drawn here as SVG and rasterised: the price staircase on
 *      the board, the printed lines on the receipt. Type and rules stay crisp
 *      and stay in the station's palette.
 *   2. The *photograph* is made in Blender (scripts/render-panels.py), which
 *      puts that content into a room with real lights, real materials and a real
 *      lens. Cycles does the depth of field, the falloff and the reflections.
 *
 * Nothing is licensed, nothing is downloaded, and re-cutting any of it is a
 * matter of editing these two files and running `pnpm art:build`.
 *
 * Only the price board is built this way. The fronts for honesty, treasury and
 * the room are fixed stills that live in public/panels and are not regenerated
 * here, so running this cannot overwrite them; pass their names explicitly if you
 * ever want the Blender versions back (they are kept in
 * design_enhancements/panel-alternates). "The picture" shows the live programme
 * and "About" uses the founder's photograph, so neither has artwork at all.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const TEX_DIR = path.join(ROOT, ".render", "tex");
const OUT_DIR = path.join(ROOT, ".render", "out");
const PUBLIC_DIR = path.join(ROOT, "public", "panels");
const LOGO = path.join(ROOT, "public", "anduril logo.png");

const INK = { 950: "#050607", 900: "#0a0b0d", 800: "#15181c", 700: "#1d2126", 600: "#2a2f36", 500: "#3c434c", 400: "#5b6470", 300: "#8b95a3", 100: "#e6e9ee", 50: "#f7f8fa" };
const SIGNAL = "#ccff00";

/* -------------------------------------------------------------------------- */
/*  The board: a price walking down                                           */
/* -------------------------------------------------------------------------- */

/** The staircase an auction actually makes: the ask holds, steps, holds again. */
function ladder(seed: number, top: number, bottom: number, steps: number, w: number, pad: number) {
  const span = w - pad * 2;
  const pts: Array<[number, number]> = [];
  let y = top;
  const drop = (bottom - top) / steps;
  for (let i = 0; i <= steps; i++) {
    const x0 = pad + (span * i) / steps;
    const x1 = pad + (span * (i + 0.64)) / steps;
    pts.push([x0, Math.min(y, bottom)], [Math.min(x1, w - pad), Math.min(y, bottom)]);
    y += drop * (0.7 + ((Math.sin(seed * 9.7 + i * 2.3) + 1) / 2) * 0.6);
  }
  return { d: pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" "), last: pts[pts.length - 1] };
}

function boardTexture(): string {
  const w = 1200;
  const h = 1500;
  const front = ladder(1, 330, 1180, 7, w, 130);
  const back = ladder(4.2, 235, 1090, 9, w, 130);

  const grid: string[] = [];
  for (let x = 100; x < w; x += 75) grid.push(`<line x1="${x}" y1="150" x2="${x}" y2="${h - 120}" />`);
  for (let y = 200; y < h - 100; y += 75) grid.push(`<line x1="90" y1="${y}" x2="${w - 90}" y2="${y}" />`);

  const ticks: string[] = [];
  for (let i = 0; i < 13; i++) {
    const y = 250 + i * 75;
    const wide = i % 3 === 0;
    ticks.push(`<line x1="62" y1="${y}" x2="${wide ? 104 : 84}" y2="${y}" stroke="${wide ? INK[400] : INK[600]}" stroke-width="3" />`);
    if (wide) ticks.push(`<rect x="118" y="${y - 6}" width="${42 + (i % 4) * 11}" height="9" rx="1" fill="${INK[700]}" />`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="under" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${SIGNAL}" stop-opacity="0.30" />
        <stop offset="100%" stop-color="${SIGNAL}" stop-opacity="0" />
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="${INK[950]}" />
    <g stroke="#ffffff" stroke-width="1.6" opacity="0.06">${grid.join("")}</g>
    <g>${ticks.join("")}</g>
    <rect x="118" y="150" width="230" height="14" rx="2" fill="${INK[600]}" />
    <rect x="118" y="180" width="150" height="10" rx="2" fill="${INK[700]}" />
    <path d="${back.d}" fill="none" stroke="${INK[700]}" stroke-width="5" stroke-linejoin="round" />
    <path d="${front.d} L ${w - 130} ${h - 120} L 130 ${h - 120} Z" fill="url(#under)" />
    <path d="${front.d}" fill="none" stroke="${SIGNAL}" stroke-width="7" stroke-linejoin="round" />
    <circle cx="${front.last[0]}" cy="${front.last[1]}" r="16" fill="${SIGNAL}" />
    <circle cx="${front.last[0]}" cy="${front.last[1]}" r="36" fill="none" stroke="${SIGNAL}" stroke-width="2.5" opacity="0.55" />
  </svg>`;
}

/* -------------------------------------------------------------------------- */
/*  The receipt: what was printed on the slip                                 */
/* -------------------------------------------------------------------------- */

function receiptTexture(): string {
  const w = 900;
  const h = 1900;
  const rows: string[] = [];
  let y = 470;
  const widths = [430, 330, 400, 250, 370, 300, 415, 265, 350, 300];
  for (let i = 0; i < widths.length; i++) {
    rows.push(`<rect x="120" y="${y}" width="${widths[i]}" height="15" rx="2" fill="${INK[500]}" opacity="${0.62 + (i % 3) * 0.12}" />`);
    rows.push(`<rect x="${w - 120 - (92 - (i % 3) * 20)}" y="${y}" width="${92 - (i % 3) * 20}" height="15" rx="2" fill="${INK[400]}" opacity="0.72" />`);
    y += 66;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="#f4f5f7" />
    <rect x="120" y="250" width="330" height="26" rx="3" fill="${INK[900]}" />
    <rect x="120" y="300" width="190" height="13" rx="2" fill="${INK[400]}" />
    <line x1="120" y1="400" x2="${w - 120}" y2="400" stroke="${INK[600]}" stroke-width="3" />
    ${rows.join("")}
    <line x1="120" y1="${y + 24}" x2="${w - 120}" y2="${y + 24}" stroke="${INK[600]}" stroke-width="4" />
    <rect x="120" y="${y + 62}" width="230" height="27" rx="3" fill="${INK[900]}" />
    <rect x="${w - 120 - 200}" y="${y + 62}" width="200" height="27" rx="3" fill="${INK[900]}" />
    <g transform="translate(${w / 2} ${y + 300}) rotate(-11)" opacity="0.9">
      <circle cx="0" cy="0" r="118" fill="none" stroke="${SIGNAL}" stroke-width="9" />
      <circle cx="0" cy="0" r="95" fill="none" stroke="${SIGNAL}" stroke-width="3.5" />
      <path d="M-44 4 L -14 36 L 47 -32" fill="none" stroke="${SIGNAL}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" />
    </g>
    <g fill="${INK[300]}" opacity="0.55">
      ${Array.from({ length: 26 }, (_, i) => `<rect x="${120 + i * 25}" y="${h - 190}" width="13" height="34" />`).join("")}
    </g>
  </svg>`;
}

/* -------------------------------------------------------------------------- */

function findBlender(): string | null {
  if (process.env.BLENDER_PATH && existsSync(process.env.BLENDER_PATH)) return process.env.BLENDER_PATH;
  const roots = ["C:/Program Files/Blender Foundation", "C:/Program Files (x86)/Blender Foundation"];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root).sort().reverse()) {
      const exe = path.join(root, dir, "blender.exe");
      if (existsSync(exe)) return exe;
    }
  }
  for (const p of ["/usr/bin/blender", "/usr/local/bin/blender", "/Applications/Blender.app/Contents/MacOS/Blender"]) if (existsSync(p)) return p;
  return null;
}

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  mkdirSync(TEX_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(PUBLIC_DIR, { recursive: true });

  // 1. content
  for (const [name, svg] of [
    ["board", boardTexture()],
    ["receipt", receiptTexture()],
  ] as const) {
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    writeFileSync(path.join(TEX_DIR, `${name}.png`), buf);
    console.log(`texture ${name}.png (${(buf.length / 1024).toFixed(0)} KB)`);
  }

  // 2. photograph
  const blender = findBlender();
  if (!blender) {
    console.error("Blender not found. Set BLENDER_PATH to the executable and re-run.");
    process.exit(1);
  }
  // Default to the one panel this pipeline still owns. The other three scenes
  // remain in render-panels.py and can be asked for by name.
  const scenes = only.length ? only : ["clock"];
  console.log(`rendering ${scenes.join(", ")} with ${blender}`);
  const res = spawnSync(blender, ["-b", "--factory-startup", "-P", path.join(ROOT, "scripts", "render-panels.py"), "--", TEX_DIR, OUT_DIR, LOGO, ...scenes], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const log = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  for (const line of log.split(/\r?\n/)) if (/PANEL_RENDERED|ALL_PANELS_DONE|Error|Traceback|SKIP_UNKNOWN/.test(line)) console.log(line.trim());
  if (res.status !== 0) {
    console.error(log.slice(-4000));
    process.exit(res.status ?? 1);
  }

  // 3. ship
  for (const name of scenes) {
    const src = path.join(OUT_DIR, `${name}.png`);
    if (!existsSync(src)) {
      console.error(`missing render for ${name}`);
      process.exit(1);
    }
    const buf = await sharp(src).webp({ quality: 90 }).toBuffer();
    writeFileSync(path.join(PUBLIC_DIR, `${name}.webp`), buf);
    console.log(`wrote public/panels/${name}.webp (${(buf.length / 1024).toFixed(0)} KB)`);
  }
}

void main();
