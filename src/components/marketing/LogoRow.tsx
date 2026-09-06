"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { PARTNERS, type LogoEntry } from "@/lib/partners";
import { marqueeCopies } from "@/lib/marquee";

/**
 * A full-bleed row of logos that scrolls across the page. Deliberately has no
 * container: no card, no border, no background — just the marks moving through
 * a soft edge fade, so it reads as part of the page rather than a widget.
 *
 * The track holds the list several times over and translates by exactly one
 * copy, so the loop is seamless. How many copies is measured rather than
 * assumed: a fixed pair only closes the loop while one copy is wider than the
 * viewport, and on a wide screen a short list would otherwise run out and drag
 * an empty gap through the row before it jumped back. Every copy after the
 * first is hidden from assistive technology and carries no links; the animation
 * pauses on hover and stops entirely under reduced motion.
 */
export function LogoRow({ items = PARTNERS, label, speedSec = 52 }: { items?: LogoEntry[]; label?: string; speedSec?: number }) {
  const viewport = useRef<HTMLDivElement | null>(null);
  const firstRun = useRef<HTMLUListElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  // Two copies and a percentage shift is what the markup renders before it has
  // been measured, which is also the server's answer.
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
  // detached element and the row keeps the width it was first measured at.
  const attach = useCallback(
    <T extends Element>(slot: { current: T | null }, node: T | null) => {
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
  const setViewport = useCallback((node: HTMLDivElement | null) => attach(viewport, node), [attach]);
  const setFirstRun = useCallback((node: HTMLUListElement | null) => attach(firstRun, node), [attach]);

  useEffect(() => {
    // A resize listener because an observer can miss a viewport change, and
    // fonts.ready because the names are wider once the web font has swapped in.
    measure();
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      window.removeEventListener("resize", measure);
      observer.current?.disconnect();
      observer.current = null;
    };
  }, [measure, items]);

  const style = { "--marquee-duration": `${speedSec}s`, ...(shift === null ? null : { "--marquee-shift": `${shift}px` }) } as CSSProperties;

  return (
    <section aria-label={label ?? "Runs on"} className="relative py-2">
      {label && <div className="label mb-5 px-4 text-center">{label}</div>}
      <div ref={setViewport} className="marquee" style={style}>
        <div className="marquee-track">
          {Array.from({ length: copies }, (_, i) => (
            <Run key={i} items={items} innerRef={i === 0 ? setFirstRun : undefined} duplicate={i > 0} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Run({ items, duplicate = false, innerRef }: { items: LogoEntry[]; duplicate?: boolean; innerRef?: (node: HTMLUListElement | null) => void }) {
  return (
    <ul ref={innerRef} className="flex shrink-0 items-center gap-12 pr-12 md:gap-16 md:pr-16" aria-hidden={duplicate || undefined}>
      {items.map((item) => {
        const inner = (
          <>
            <span className="text-ink-400 transition-colors duration-200 group-hover:text-signal">{item.mark}</span>
            <span className="whitespace-nowrap text-[13px] font-medium tracking-tight text-ink-300 transition-colors duration-200 group-hover:text-ink-50">{item.name}</span>
          </>
        );
        return (
          <li key={`${item.name}${duplicate ? "-dup" : ""}`} className="shrink-0">
            {item.href && !duplicate ? (
              <a href={item.href} target="_blank" rel="noreferrer noopener" title={item.role} className="group inline-flex items-center gap-2.5 outline-offset-4">
                {inner}
              </a>
            ) : (
              <span className="group inline-flex items-center gap-2.5" title={item.role}>
                {inner}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
