"use client";

import type { CSSProperties } from "react";
import { PARTNERS, type LogoEntry } from "@/lib/partners";
import { useMarquee } from "@/lib/useMarquee";

/**
 * A full-bleed row of logos that scrolls across the page. Deliberately has no
 * container: no card, no border, no background — just the marks moving through
 * a soft edge fade, so it reads as part of the page rather than a widget.
 *
 * The track holds the list as many times as it takes to outrun the viewport and
 * translates by exactly one copy, so the loop is seamless — useMarquee explains
 * why that count is measured rather than fixed at two. Every copy after the
 * first is hidden from assistive technology and carries no links; the animation
 * pauses on hover and stops entirely under reduced motion.
 */
export function LogoRow({ items = PARTNERS, label, speedSec = 52 }: { items?: LogoEntry[]; label?: string; speedSec?: number }) {
  const { copies, shift, setViewport, setFirstRun } = useMarquee(items);
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

function Run({ items, duplicate = false, innerRef }: { items: LogoEntry[]; duplicate?: boolean; innerRef?: (node: HTMLElement | null) => void }) {
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
