"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { cn } from "@/lib/format";
import styles from "./FlipCard.module.css";

/**
 * A panel that turns over.
 *
 * The front is a picture with the headline sitting in a gradient along the
 * bottom; the back is the argument, set as a document. The whole front is the
 * control that turns it, so the affordance is the card itself rather than a
 * button hidden in a corner. The back keeps its own two controls — a real link
 * out to the product, and the one that turns it back — because a card that can
 * only be escaped by clicking the thing you are reading is a trap.
 *
 * Both faces are always in the DOM, cross-faded on a short delay so the text
 * never shows through the card mid-rotation. Under prefers-reduced-motion the
 * rotation is skipped and the faces simply swap.
 */
export interface FlipCardProps {
  /** "01", "02" … shown before the eyebrow. */
  index: string;
  eyebrow: string;
  title: string;
  /** The line in the front's footer bar, left of "Turn over". */
  frontNote: string;
  /** Full-bleed visual behind the front. */
  media: ReactNode;
  children: ReactNode;
  cta: { href: string; label: string };
  className?: string;
  id?: string;
}

export function FlipCard({ index, eyebrow, title, frontNote, media, children, cta, className, id }: FlipCardProps) {
  const [flipped, setFlipped] = useState(false);
  const reduced = usePrefersReducedMotion();
  const label = flipped ? `${eyebrow} — back to the picture` : `${eyebrow} — read more`;
  const toggle = useCallback(() => setFlipped((f) => !f), []);

  return (
    <div id={id} className={cn("[perspective:1800px]", styles.panel, className)}>
      <div
        className="relative min-h-[540px] w-full [transform-style:preserve-3d]"
        style={{
          transition: reduced ? undefined : "transform .75s cubic-bezier(.16,1,.3,1)",
          transform: flipped && !reduced ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* ---- front ---------------------------------------------------- */}
        <div
          className={cn("absolute inset-0 overflow-hidden rounded border border-white/[0.14] bg-ink-900", styles.front)}
          style={{ opacity: flipped ? 0 : 1, transition: "opacity .2s linear .3s", pointerEvents: flipped ? "none" : "auto" }}
          aria-hidden={flipped}
        >
          <div className={cn("absolute inset-0", styles.art)}>{media}</div>
          <div className={styles.registration} aria-hidden="true" />
          <div className={styles.chapter} aria-hidden="true">Field notes<span className={styles.chapterNumber}>{index}</span></div>
          <button
            type="button"
            onClick={toggle}
            aria-label={label}
            className="absolute inset-0 flex cursor-pointer flex-col justify-end text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal"
            tabIndex={flipped ? -1 : 0}
            data-testid={id ? `${id}-panel-front` : undefined}
          >
            <span className={styles.readMark} aria-hidden="true">↗</span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%]"
              style={{ background: "linear-gradient(0deg,rgba(0,0,0,.96) 0%,rgba(0,0,0,.82) 46%,rgba(0,0,0,0) 100%)" }}
            />
            <div className="relative w-full px-6">
              <div className="mono text-[10px] uppercase tracking-[0.2em] text-signal">
                {index} · {eyebrow}
              </div>
              <h3 className="mt-3 text-[clamp(22px,2.2vw,30px)] font-medium leading-[1.04] tracking-[-0.04em] text-ink-50 [text-wrap:pretty]">{title}</h3>
              <div className="mono -mx-6 mt-6 flex items-center justify-between gap-4 whitespace-nowrap border-t border-white/[0.14] px-6 py-4 text-[10px] uppercase tracking-[0.18em]">
                <span className="text-ink-200">{frontNote}</span>
                <span className="text-signal">Turn over ↻</span>
              </div>
            </div>
          </button>
        </div>

        {/* ---- back ------------------------------------------------------ */}
        <div
          className={cn("absolute inset-0 flex flex-col overflow-hidden rounded border border-white/20 bg-ink-850", styles.back)}
          style={{
            opacity: flipped ? 1 : 0,
            transition: "opacity .2s linear .3s",
            transform: reduced ? undefined : "rotateY(180deg)",
            pointerEvents: flipped ? "auto" : "none",
          }}
          aria-hidden={!flipped}
          data-testid={id ? `${id}-panel-back` : undefined}
        >
          <div className="scrollbar-thin min-h-0 flex-1 overflow-auto px-6 pt-6">
            <div className="mono text-[10px] uppercase tracking-[0.2em] text-signal">
              {index} · {eyebrow}
            </div>
            <h2 className="mt-3.5 text-[clamp(26px,2.6vw,36px)] font-medium leading-[1.02] tracking-[-0.04em] text-ink-50 [text-wrap:pretty]">{title}</h2>
            {children}
            <div className="h-6" />
          </div>
          <div className="mono flex items-center justify-between gap-4 whitespace-nowrap border-t border-white/12 bg-signal/[0.06] px-6 py-4 text-[10px] uppercase tracking-[0.18em]">
            <Link href={cta.href} className="mono uppercase text-signal transition hover:text-ink-50" tabIndex={flipped ? 0 : -1}>
              {cta.label} →
            </Link>
            <button type="button" onClick={toggle} aria-label={label} className="mono uppercase text-ink-300 transition hover:text-ink-50" tabIndex={flipped ? 0 : -1}>
              Turn back ↻
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
