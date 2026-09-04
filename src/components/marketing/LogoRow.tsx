"use client";

import { PARTNERS, type LogoEntry } from "@/lib/partners";

/**
 * A full-bleed row of logos that scrolls across the page. Deliberately has no
 * container: no card, no border, no background — just the marks moving through
 * a soft edge fade, so it reads as part of the page rather than a widget.
 *
 * The track holds the list twice and translates by exactly half its width, so
 * the loop is seamless. The duplicate is hidden from assistive technology and
 * the animation pauses on hover and stops entirely under reduced motion.
 */
export function LogoRow({ items = PARTNERS, label, speedSec = 52 }: { items?: LogoEntry[]; label?: string; speedSec?: number }) {
  return (
    <section aria-label={label ?? "Runs on"} className="relative py-2">
      {label && <div className="label mb-5 px-4 text-center">{label}</div>}
      <div className="marquee" style={{ ["--marquee-duration" as string]: `${speedSec}s` }}>
        <div className="marquee-track">
          <Run items={items} />
          <Run items={items} duplicate />
        </div>
      </div>
    </section>
  );
}

function Run({ items, duplicate = false }: { items: LogoEntry[]; duplicate?: boolean }) {
  return (
    <ul className="flex shrink-0 items-center gap-12 pr-12 md:gap-16 md:pr-16" aria-hidden={duplicate || undefined}>
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
