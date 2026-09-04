"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { cn } from "@/lib/format";

const KEY = "airtime.content-notice.v1";

export const CONTENT_NOTICE_SHORT = "Unrated. No content ratings or viewer discretion warnings are applied to anything on this network.";

export const CONTENT_NOTICE_LONG =
  "AIRTIME does not rate its programming. There is no TV rating system here, no age gate and no viewer discretion advisory before anything plays. " +
  "Everything that runs during station time is submitted by users who paid for the surface it appears on, and it is shown as submitted. " +
  "Placements marked for review are checked by a moderator against the network's content rules before they can air, but that is a policy check, not a rating, " +
  "and it makes no statement about whether the material is suitable for you. Watch at your own discretion.";

/**
 * First-visit notice about unrated, user-submitted programming.
 *
 * It is dismissed per browser and stated permanently in the footer and on the
 * docs page, so the disclosure survives the dismissal.
 */
export function ContentNotice({ className }: { className?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(KEY)) setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* private mode: it will show again next visit */
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
          className={cn("glass-strong fixed bottom-24 left-1/2 z-40 w-[min(92vw,520px)] -translate-x-1/2 rounded-xl p-4 md:bottom-6 md:left-6 md:translate-x-0", className)}
          aria-label="Content notice"
        >
          <div className="label-strong">Unrated programming</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">
            Nothing on this network carries a TV rating or a viewer discretion warning. Everything you see during station time is a user submission that was paid
            for. Watch at your own discretion.
          </p>
          <div className="mt-3.5 flex items-center gap-2">
            <button className="btn btn-primary btn-sm" onClick={dismiss}>
              Understood
            </button>
            <Link href="/docs#content" className="btn btn-ghost btn-sm" onClick={dismiss}>
              Content policy
            </Link>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
