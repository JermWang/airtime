"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Wordmark } from "./Wordmark";
import { usePrefersReducedMotion } from "@/lib/hooks";

/**
 * Station ident shown for ~1.4 s on first load: black, a single carrier bar
 * that locks on, the wordmark, then the studio fades in underneath.
 */
export function Ident({ onDone }: { onDone?: () => void }) {
  const reduced = usePrefersReducedMotion();
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(
      () => {
        setShow(false);
        onDone?.();
      },
      reduced ? 300 : 1500,
    );
    return () => clearTimeout(t);
  }, [onDone, reduced]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="ident"
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-ink-950"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduced ? 0.1 : 0.7, ease: [0.2, 0.8, 0.2, 1] } }}
        >
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0.1 : 0.6, delay: 0.2 }}>
            <Wordmark size={28} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
