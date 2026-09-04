"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useStation } from "@/lib/store";
import { useIsMobile } from "@/lib/hooks";
import { webglAvailable } from "@/components/studio/perf";
import { StationPlayer } from "./StationPlayer";
import { StatusRail } from "@/components/hud/StatusRail";
import { BuyAirtimeControl } from "@/components/hud/BuyAirtimeControl";
import { PlacementPanel } from "@/components/hud/PlacementPanel";
import { MobileDock } from "@/components/hud/MobileDock";
import { Ident } from "@/components/hud/Ident";
import { SoundBlockedPrompt } from "@/components/hud/SoundControl";
import { ContentNotice } from "@/components/hud/ContentNotice";
import { AddressChip, TokenContractChip } from "@/components/hud/AddressChip";
import { BroadcastLog } from "@/components/hud/BroadcastLog";
import { InventoryList } from "@/components/hud/InventoryDrawer";
import { ProgramGuide } from "@/components/hud/ProgramGuide";
import { StationChat } from "@/components/hud/StationChat";
import { cn } from "@/lib/format";

const StudioCanvas = dynamic(() => import("@/components/studio/StudioCanvas").then((m) => m.StudioCanvas), { ssr: false, loading: () => null });

/**
 * The homepage IS the station. Television starts immediately (2D), the
 * studio streams in behind it, and once the scene is ready the 2D picture
 * hands over to the main display in the room (desktop). WebGL is optional:
 * without it the 2D station and the full purchase flow remain.
 */
export function StationShell({ channelId = "MAIN" }: { channelId?: string }) {
  const webgl = useStation((s) => s.webglAvailable);
  const setWebgl = useStation((s) => s.setWebgl);
  const focused = useStation((s) => s.focusedPlacementId);
  const focusPlacement = useStation((s) => s.focusPlacement);
  const drawer = useStation((s) => s.drawer);
  const setDrawer = useStation((s) => s.setDrawer);
  const mode = useStation((s) => s.mode);
  const mobile = useIsMobile();
  const [identDone, setIdentDone] = useState(false);

  useEffect(() => {
    setWebgl(webglAvailable());
  }, [setWebgl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        focusPlacement(null);
        setDrawer("none");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusPlacement, setDrawer]);

  const use3d = webgl === true;
  // The 2D picture is the fallback, not an overlay. When the studio is running on
  // desktop the only picture is the one in the room: the media element keeps
  // playing off-screen and feeds the WebGL texture, so nothing is drawn on top of
  // the screen and no frame edges float over it.
  const show2d = !use3d || mobile;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ink-950">
      <Ident onDone={() => setIdentDone(true)} />
      {use3d && (
        <motion.div className="fixed inset-0" initial={{ opacity: 0 }} animate={{ opacity: identDone ? 1 : 0 }} transition={{ duration: 1.2, ease: "easeOut" }}>
          <StudioCanvas channelId={channelId} />
        </motion.div>
      )}

      {/* 2D station picture: the hero on mobile and wherever WebGL is unavailable.
          On desktop with the studio running it is not rendered at all - the element
          below keeps playing so the 3D screen has a texture. */}
      {show2d ? (
        <motion.div
          className={cn("pointer-events-none fixed left-1/2 z-10 -translate-x-1/2", mobile ? "top-16 w-[calc(100%-1.5rem)]" : "top-1/2 w-[min(70vw,1100px)] -translate-y-1/2")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="pointer-events-auto overflow-hidden rounded-lg bg-black">
            <StationPlayer channelId={channelId} visible className="aspect-video w-full" />
          </div>
        </motion.div>
      ) : (
        <StationPlayer channelId={channelId} visible={false} />
      )}

      <StatusRail channelId={channelId} compact={mobile} />
      <SoundBlockedPrompt />
      <ContentNotice />
      {!mobile && <BuyAirtimeControl />}
      <PlacementPanel channelId={channelId} />

      {/* Mobile: dock + sheets */}
      {mobile && (
        <>
          <div className="fixed inset-x-3 top-[calc(3.5rem+56vw)] z-10 flex gap-2">
            <button className="btn btn-primary flex-1" onClick={() => setDrawer(drawer === "inventory" ? "none" : "inventory")}>
              Buy airtime
            </button>
            <button className="btn flex-1" onClick={() => setDrawer(drawer === "queue" ? "none" : "queue")}>
              Log
            </button>
            <button className="btn flex-1" onClick={() => setDrawer(drawer === "chat" ? "none" : "chat")}>
              Chat
            </button>
          </div>
          <AnimatePresence>
            {drawer !== "none" && !focused && (
              <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} className="glass-strong fixed inset-x-2 z-30 max-h-[50vh] overflow-hidden rounded-t-2xl p-3" style={{ bottom: "calc(64px + var(--safe-bottom))" }}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="label-strong">{drawer === "inventory" ? "Inventory" : drawer === "queue" ? "Broadcast log" : drawer === "chat" ? "Chat" : "Guide"}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDrawer("none")}>
                    ✕
                  </button>
                </div>
                {drawer === "inventory" && <InventoryList className="max-h-[40vh]" onSelect={(p) => { focusPlacement(p.id); setDrawer("none"); }} />}
                {drawer === "queue" && <BroadcastLog className="max-h-[40vh]" compact />}
                {drawer === "guide" && <ProgramGuide className="max-h-[40vh]" />}
                {drawer === "chat" && <StationChat className="h-[42vh]" compact />}
              </motion.div>
            )}
          </AnimatePresence>
          <MobileDock />
        </>
      )}

      {/* No-WebGL notice (unobtrusive) */}
      {webgl === false && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-20 -translate-x-1/2 md:bottom-6">
          <div className="glass rounded-md px-3 py-1.5 text-[11px] text-ink-300">3D studio unavailable on this device — the station and airtime purchasing work as usual.</div>
        </div>
      )}

      <div className="pointer-events-auto fixed bottom-2 left-3 z-20 hidden items-center gap-3 md:flex">
        <AddressChip />
        <TokenContractChip />
        <div className="mono text-[9px] uppercase tracking-[0.16em] text-ink-500">
          <Link href="/info" className="text-ink-300 transition hover:text-signal">
            info
          </Link>{" "}
          ·{" "}
          <Link href="/docs" className="text-ink-300 transition hover:text-signal">
            docs
          </Link>{" "}
          · Every fee buys Anduril pre-stock ·{" "}
          <Link href="/treasury" className="text-signal">
            treasury
          </Link>
        </div>
      </div>
      {mode === "focus" && !mobile && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-20 -translate-x-1/2">
          <div className="mono text-[10px] uppercase tracking-[0.16em] text-ink-400">Esc to return to the station</div>
        </div>
      )}
    </main>
  );
}
