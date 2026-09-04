"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/hooks";

/**
 * A portrait held in a glass disc.
 *
 * The disc tracks the pointer: it tilts on two axes, drifts a little toward the
 * cursor, and its specular highlight follows the same point, so the glass reads
 * as a physical object catching a light source rather than a CSS circle. The
 * ring behind it counter-rotates slightly, which is what sells the depth.
 *
 * Everything is damped in a single animation frame loop, and the whole effect is
 * skipped under prefers-reduced-motion, where it renders as a still portrait.
 */
export function GlassPortrait({ src, alt, size = 300 }: { src: string; alt: string; size?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const disc = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  /** Pointer position in disc-local space, -1..1. */
  const target = useRef({ x: 0, y: 0, on: 0 });
  const current = useRef({ x: 0, y: 0, on: 0 });
  const raf = useRef(0);

  const onMove = useCallback((e: PointerEvent) => {
    const el = wrap.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Normalised by a radius a bit larger than the disc, so the effect keeps
    // responding while the cursor is near it rather than only on top of it.
    const reach = Math.max(r.width, r.height) * 0.9;
    const x = (e.clientX - cx) / reach;
    const y = (e.clientY - cy) / reach;
    const dist = Math.hypot(x, y);
    target.current.x = Math.max(-1.4, Math.min(1.4, x));
    target.current.y = Math.max(-1.4, Math.min(1.4, y));
    target.current.on = dist < 1.6 ? 1 : 0;
  }, []);

  useEffect(() => {
    if (reduced) return;
    const tick = () => {
      const c = current.current;
      const t = target.current;
      c.x += (t.x - c.x) * 0.09;
      c.y += (t.y - c.y) * 0.09;
      c.on += (t.on - c.on) * 0.06;

      const d = disc.current;
      const g = glare.current;
      const rg = ring.current;
      if (d) {
        // Tilt toward the pointer, and lean the whole disc a little that way too.
        const rotY = c.x * 13;
        const rotX = -c.y * 13;
        const push = 10;
        d.style.transform = `perspective(900px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translate3d(${(c.x * push).toFixed(2)}px, ${(c.y * push).toFixed(2)}px, 0)`;
        d.style.boxShadow = `${(-c.x * 26).toFixed(1)}px ${(-c.y * 18 + 28).toFixed(1)}px 60px rgba(0,0,0,0.55)`;
      }
      if (g) {
        // The highlight sits where the light would be: opposite the tilt.
        g.style.background = `radial-gradient(circle at ${(50 + c.x * 34).toFixed(1)}% ${(38 + c.y * 30).toFixed(1)}%, rgba(255,255,255,${(0.34 + c.on * 0.16).toFixed(3)}) 0%, rgba(255,255,255,0.06) 34%, rgba(255,255,255,0) 62%)`;
      }
      if (rg) {
        rg.style.transform = `perspective(900px) rotateX(${(c.y * 7).toFixed(2)}deg) rotateY(${(-c.x * 7).toFixed(2)}deg) scale(${(1 + c.on * 0.02).toFixed(4)})`;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("pointermove", onMove);
    };
  }, [onMove, reduced]);

  return (
    <div ref={wrap} className="glass-portrait" style={{ width: size, height: size }}>
      {/* Halo: the light the glass is sitting in. */}
      <div className="glass-portrait-halo" aria-hidden />
      {/* Counter-rotating ring. */}
      <div ref={ring} className="glass-portrait-ring" aria-hidden />
      <div ref={disc} className="glass-portrait-disc">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} width={size} height={size} draggable={false} className="glass-portrait-img" />
        <div className="glass-portrait-rim" aria-hidden />
        <div ref={glare} className="glass-portrait-glare" aria-hidden />
      </div>
    </div>
  );
}
