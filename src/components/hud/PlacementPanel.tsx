"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePlacements, useIsMobile } from "@/lib/hooks";
import { useStation } from "@/lib/store";
import { PurchaseFlow } from "@/components/airtime/PurchaseFlow";

/**
 * Glass control surface that emerges beside the focused object (desktop) or as
 * a bottom sheet (mobile). Hosts the purchase flow for the focused placement.
 */
export function PlacementPanel({ channelId = "MAIN" }: { channelId?: string }) {
  const focused = useStation((s) => s.focusedPlacementId);
  const focusPlacement = useStation((s) => s.focusPlacement);
  const setDrawer = useStation((s) => s.setDrawer);
  const { data } = usePlacements(channelId);
  const placement = data?.placements.find((p) => p.id === focused) ?? null;
  const mobile = useIsMobile();

  return (
    <AnimatePresence>
      {placement && (
        <motion.aside
          key={placement.id}
          initial={mobile ? { opacity: 0, y: 40 } : { opacity: 0, x: 24, scale: 0.985 }}
          animate={mobile ? { opacity: 1, y: 0 } : { opacity: 1, x: 0, scale: 1 }}
          exit={mobile ? { opacity: 0, y: 40 } : { opacity: 0, x: 24, scale: 0.985 }}
          transition={{ duration: 0.34, ease: [0.2, 0.8, 0.2, 1] }}
          className={
            mobile
              ? "glass-strong fixed inset-x-2 z-40 max-h-[72vh] overflow-y-auto rounded-t-2xl p-4 scrollbar-thin"
              : "glass-strong specular fixed right-5 top-16 z-40 max-h-[calc(100vh-7rem)] w-[400px] overflow-y-auto rounded-xl p-4 scrollbar-thin"
          }
          style={mobile ? { bottom: "calc(64px + var(--safe-bottom))" } : undefined}
          aria-label={`Buy ${placement.name}`}
          data-testid="placement-panel"
        >
          <PurchaseFlow
            placement={placement}
            onClose={() => focusPlacement(null)}
            onConfirmed={() => setDrawer("queue")}
            compact={mobile}
          />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
