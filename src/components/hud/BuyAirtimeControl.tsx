"use client";

import { AnimatePresence, motion } from "motion/react";
import { useStation } from "@/lib/store";
import { InventoryList } from "./InventoryDrawer";
import { BroadcastLog } from "./BroadcastLog";
import { ProgramGuide } from "./ProgramGuide";
import { cn } from "@/lib/format";

/**
 * Desktop bottom-right glass control. Opens the browse mode (surfaces light
 * up in the studio) and hosts the conventional inventory / log / guide drawers
 * that stay visually integrated with the environment.
 */
export function BuyAirtimeControl() {
  const mode = useStation((s) => s.mode);
  const setMode = useStation((s) => s.setMode);
  const drawer = useStation((s) => s.drawer);
  const setDrawer = useStation((s) => s.setDrawer);
  const focusPlacement = useStation((s) => s.focusPlacement);
  const focused = useStation((s) => s.focusedPlacementId);

  return (
    <>
      <div className="pointer-events-none fixed bottom-5 right-5 z-30 hidden flex-col items-end gap-2 md:flex">
        <AnimatePresence>
          {drawer !== "none" && (
            <motion.div
              key={drawer}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
              className="glass-strong specular pointer-events-auto flex max-h-[60vh] w-[380px] flex-col rounded-xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex gap-1">
                  {(["inventory", "queue", "guide"] as const).map((d) => (
                    <button key={d} className={cn("btn btn-ghost btn-sm", drawer === d && "bg-white/10")} onClick={() => setDrawer(d)}>
                      {d === "inventory" ? "Inventory" : d === "queue" ? "Broadcast log" : "Guide"}
                    </button>
                  ))}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setDrawer("none")} aria-label="Close">
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1 p-3">
                {drawer === "inventory" && (
                  <InventoryList
                    className="max-h-[46vh]"
                    onSelect={(p) => {
                      focusPlacement(p.id);
                      setDrawer("none");
                    }}
                  />
                )}
                {drawer === "queue" && <BroadcastLog className="max-h-[46vh]" />}
                {drawer === "guide" && <ProgramGuide className="max-h-[46vh]" hours={6} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="glass specular pointer-events-auto flex items-center gap-1 rounded-lg p-1">
          <button className={cn("btn btn-ghost btn-sm", drawer === "guide" && "bg-white/10")} onClick={() => setDrawer(drawer === "guide" ? "none" : "guide")}>
            Guide
          </button>
          <button className={cn("btn btn-ghost btn-sm", drawer === "queue" && "bg-white/10")} onClick={() => setDrawer(drawer === "queue" ? "none" : "queue")}>
            Log
          </button>
          <button className={cn("btn btn-ghost btn-sm", drawer === "inventory" && "bg-white/10")} onClick={() => setDrawer(drawer === "inventory" ? "none" : "inventory")}>
            Browse all inventory
          </button>
          <span className="mx-1 h-4 w-px bg-white/15" />
          <button
            className={cn("btn btn-sm", mode === "browse" ? "" : "btn-primary")}
            onClick={() => {
              if (mode === "browse" || focused) {
                focusPlacement(null);
                setMode("watch");
              } else {
                setMode("browse");
              }
            }}
          >
            {mode === "browse" || focused ? "Back to station" : "Buy airtime"}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {mode === "browse" && !focused && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="pointer-events-none fixed bottom-6 left-1/2 z-30 hidden -translate-x-1/2 md:block">
            <div className="glass rounded-md px-4 py-2 text-center">
              <div className="label-strong">Click any illuminated surface to buy it</div>
              <div className="mt-0.5 text-[11px] text-ink-300">or browse all inventory from the control on the right</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
