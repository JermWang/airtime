"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { marqueeCopies } from "./marquee";

export interface Marquee {
  /** How many times to render the list. */
  copies: number;
  /** Width of one copy in px, or null before the first measurement. */
  shift: number | null;
  /** Ref for the clipping box. */
  setViewport: (node: HTMLElement | null) => void;
  /** Ref for the first copy — the one that gets measured. */
  setFirstRun: (node: HTMLElement | null) => void;
}

/**
 * The measurements a seamless scrolling strip needs.
 *
 * A marquee loops by translating its track left by exactly one copy of the
 * list and snapping back. That is only invisible while the copies left on
 * screen still cover the strip, so the copy count has to be measured rather
 * than fixed at two: a short list on a wide screen runs out and drags an empty
 * gap through the row. Feed `shift` to the animation as --marquee-shift and
 * render `copies` runs, the first one carrying setFirstRun.
 *
 * Pass `resetKey` whatever changes the content, so it re-measures.
 */
export function useMarquee(resetKey?: unknown): Marquee {
  const viewport = useRef<HTMLElement | null>(null);
  const firstRun = useRef<HTMLElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const [{ copies, shift }, setMetrics] = useState<{ copies: number; shift: number | null }>({ copies: 2, shift: null });

  const measure = useCallback(() => {
    const box = viewport.current;
    const run = firstRun.current;
    if (!box || !run) return;
    const runWidth = run.getBoundingClientRect().width;
    const boxWidth = box.getBoundingClientRect().width;
    if (runWidth <= 0 || boxWidth <= 0) return;
    const next = { copies: marqueeCopies(boxWidth, runWidth), shift: runWidth };
    setMetrics((prev) => (prev.copies === next.copies && prev.shift === next.shift ? prev : next));
  }, []);

  // Callback refs rather than a one-shot effect: the observer has to follow
  // whichever nodes are actually mounted, or a remount leaves it watching a
  // detached element and the strip keeps the width it was first measured at.
  const attach = useCallback(
    (slot: { current: HTMLElement | null }, node: HTMLElement | null) => {
      if (slot.current && observer.current) observer.current.unobserve(slot.current);
      slot.current = node;
      if (!node) return;
      if (!observer.current && typeof ResizeObserver !== "undefined") observer.current = new ResizeObserver(measure);
      observer.current?.observe(node);
      measure();
    },
    [measure],
  );
  // Stable identities, so a render does not detach and rebind both refs.
  const setViewport = useCallback((node: HTMLElement | null) => attach(viewport, node), [attach]);
  const setFirstRun = useCallback((node: HTMLElement | null) => attach(firstRun, node), [attach]);

  useEffect(() => {
    // A resize listener because an observer can miss a viewport change, and
    // fonts.ready because the text is wider once the web font has swapped in.
    measure();
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      window.removeEventListener("resize", measure);
      observer.current?.disconnect();
      observer.current = null;
    };
  }, [measure, resetKey]);

  return { copies, shift, setViewport, setFirstRun };
}
