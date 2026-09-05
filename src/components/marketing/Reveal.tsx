"use client";

import { motion, type Variants } from "motion/react";
import { usePrefersReducedMotion } from "@/lib/hooks";

/**
 * Scroll reveals.
 *
 * Everything on the front page arrives the same way: it rises a little, comes
 * out of a slight blur and settles. Headlines break into words so the line
 * assembles left to right instead of appearing whole. Each section stages its
 * own children rather than the whole page animating at once, so scrolling feels
 * like walking past panels rather than triggering a sequence.
 *
 * Content that is already on screen when the page loads passes `immediate`:
 * a viewport-gated reveal would leave anything sitting in the last tenth of the
 * fold invisible, because that band is deliberately excluded to stop things
 * animating while they are still under the fold.
 *
 * Under prefers-reduced-motion nothing moves: everything renders in place.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

export function Reveal({
  children,
  delay = 0,
  y = 22,
  className,
  as = "div",
  immediate = false,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "section" | "li" | "p" | "header";
  immediate?: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const Tag = motion[as];
  if (reduced) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }
  const shown = { opacity: 1, y: 0, filter: "blur(0px)" };
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      {...(immediate ? { animate: shown } : { whileInView: shown, viewport: { once: true, amount: 0.25, margin: "0px 0px -12% 0px" } })}
      transition={{ duration: 0.75, delay, ease: EASE }}
    >
      {children}
    </Tag>
  );
}

const wordContainer: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.045, delayChildren: 0.05 } },
};

const word: Variants = {
  hidden: { opacity: 0, y: "0.5em", filter: "blur(8px)" },
  shown: { opacity: 1, y: "0em", filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
};

/** A headline that assembles word by word. */
export function RevealWords({ text, className, immediate = false }: { text: string; className?: string; immediate?: boolean }) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <span className={className}>{text}</span>;
  return (
    <motion.span
      className={className}
      variants={wordContainer}
      initial="hidden"
      {...(immediate ? { animate: "shown" } : { whileInView: "shown", viewport: { once: true, amount: 0.4 } })}
      aria-label={text}
    >
      {text.split(" ").map((w, i) => (
        // The wrapper clips the rise so words come up out of the line above.
        <span key={`${w}-${i}`} className="inline-block overflow-hidden align-bottom" aria-hidden>
          <motion.span className="inline-block" variants={word}>
            {w}
            {i < text.split(" ").length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

/** Staggers its children as a group: cards, list items, figures. */
export function RevealGroup({ children, className, gap = 0.08 }: { children: React.ReactNode; className?: string; gap?: number }) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.2 }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "li" }) {
  const reduced = usePrefersReducedMotion();
  const Tag = motion[as];
  if (reduced) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }
  return (
    <Tag
      className={className}
      variants={{ hidden: { opacity: 0, y: 20, filter: "blur(5px)" }, shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } } }}
    >
      {children}
    </Tag>
  );
}
