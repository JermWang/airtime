"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/hooks";

/**
 * A portrait held in a glass disc.
 *
 * At rest it is a still portrait and nothing moves. Put the pointer on it and
 * the disc starts tracking: it tilts on two axes, drifts a little toward the
 * cursor, and its specular highlight follows the same point, so the glass reads
 * as a physical object catching a light source rather than a CSS circle. The
 * ring behind it counter-rotates slightly, which is what sells the depth.
 *
 * Move away and it settles back to flat. The frame loop only runs while it has
 * somewhere to go, and the whole effect is skipped under prefers-reduced-motion.
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
  const hovering = useRef(false);

  const onMove = useCallback((e: PointerEvent) => {
    const el = wrap.current;
    if (!el || !hovering.current) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const reach = Math.max(r.width, r.height) / 2;
    target.current.x = Math.max(-1, Math.min(1, (e.clientX - cx) / reach));
    target.current.y = Math.max(-1, Math.min(1, (e.clientY - cy) / reach));
  }, []);

  useEffect(() => {
    if (reduced) return;
    const el = wrap.current;
    if (!el) return;

    // Only the portrait itself drives the effect. Off it, everything returns to
    // rest and the loop stops rather than idling for the life of the page.
    const enter = () => {
      hovering.current = true;
      target.current.on = 1;
      start();
    };
    const leave = () => {
      hovering.current = false;
      target.current = { x: 0, y: 0, on: 0 };
      start();
    };

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

      // At rest with the pointer away, stop: there is nothing left to animate.
      const settled = Math.abs(t.x - c.x) < 0.001 && Math.abs(t.y - c.y) < 0.001 && Math.abs(t.on - c.on) < 0.002;
      if (settled && !hovering.current) {
        raf.current = 0;
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };

    function start() {
      if (!raf.current) raf.current = requestAnimationFrame(tick);
    }

    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointermove", onMove);
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
