"use client";

import { motion } from "motion/react";
import { useBoard } from "@/lib/hooks";
import { useStation } from "@/lib/store";
import { useLiveAsk } from "./AskTicker";
import type { BoardRowDto } from "@/lib/api";
import { formatWei, formatDurationSec, cn } from "@/lib/format";

/**
 * There is one screen and two things you can buy on it.
 *
 * This is what "buy airtime" opens: not a map of surfaces to click, but the
 * question the station actually needs answered — a show, or a spot in the break.
 * Both prices are live and both are falling.
 */

function ProductCard({ row, onPick }: { row: BoardRowDto; onPick: () => void }) {
  const live = useLiveAsk(row.placement, row.surface);
  const isShow = row.placement.availability.inventoryMode === "CONTINUOUS";
  const occupant = row.surface.occupant;
  const maxLabel = row.placement.maxCreativeSec >= 120 ? `up to ${Math.round(row.placement.maxCreativeSec / 60)} minutes` : `up to ${row.placement.maxCreativeSec} seconds`;

  return (
    <button
      onClick={onPick}
      className="group flex flex-1 flex-col rounded-xl border border-white/10 bg-black/40 p-4 text-left transition hover:border-signal/60 hover:bg-white/[0.04]"
      data-testid={`product-${isShow ? "show" : "ad"}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-strong">{isShow ? "Runtime" : "Commercial"}</span>
        <span className="mono text-[9.5px] uppercase tracking-[0.14em] text-ink-500">{maxLabel}</span>
      </div>

      <p className="mt-2 min-h-[52px] text-[12px] leading-relaxed text-ink-300">
        {isShow
          ? "Your show takes the screen. It plays to everyone in the room, in sync, from the moment you buy it until somebody pays more."
          : "Your spot plays in the break, before and between shows. Every break, for as long as you hold it."}
      </p>

      <div className="mt-3 flex items-baseline justify-between border-t border-white/10 pt-3">
        <span className="mono text-[9.5px] uppercase tracking-[0.14em] text-ink-500">{occupant ? "to take it" : "price now"}</span>
        <span className="mono text-[22px] leading-none tracking-tight text-signal">{live ? formatWei(live.askWei) : "—"}</span>
      </div>

      <div className="mono mt-2 text-[9.5px] uppercase leading-relaxed tracking-[0.12em] text-ink-500">
        {occupant ? (
          <>
            {occupant.displayName} is on it · {formatDurationSec(occupant.runtimeSec)} so far
          </>
        ) : live && live.protectedForSec === 0 ? (
          <>falling to {formatWei(live.floorWei)} · nobody on it</>
        ) : (
          <>open</>
        )}
      </div>

      <span className={cn("btn btn-sm mt-3 w-full justify-center", "group-hover:border-signal group-hover:text-signal")}>
        {occupant ? "Outbid them" : isShow ? "Put on a show" : "Buy a spot"}
      </span>
    </button>
  );
}

export function ProductChooser({ channelId = "MAIN", className }: { channelId?: string; className?: string }) {
  const { data } = useBoard(channelId);
  const focusPlacement = useStation((s) => s.focusPlacement);
  const setDrawer = useStation((s) => s.setDrawer);
  const rows = (data?.rows ?? []).filter((r) => r.placement.ownsMainStream);
  const show = rows.find((r) => r.placement.availability.inventoryMode === "CONTINUOUS");
  const ad = rows.find((r) => r.placement.availability.inventoryMode === "AD_BREAK");
  const ordered = [show, ad].filter(Boolean) as BoardRowDto[];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn("glass-strong specular pointer-events-auto w-[min(92vw,620px)] rounded-2xl p-5", className)}
      data-testid="product-chooser"
    >
      <div className="mb-3">
        <div className="label-strong">What are you putting on the screen?</div>
        <div className="mt-1 text-[11.5px] leading-relaxed text-ink-300">
          Every price starts at 0.01 ETH and falls until somebody buys. Buying resets it to twice what you paid, so the only thing that raises a price here is
          somebody else wanting it.
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {ordered.map((row) => (
          <ProductCard
            key={row.placement.id}
            row={row}
            onPick={() => {
              focusPlacement(row.placement.id);
              setDrawer("none");
            }}
          />
        ))}
        {ordered.length === 0 && <div className="label p-4">Reading the market…</div>}
      </div>
    </motion.div>
  );
}
