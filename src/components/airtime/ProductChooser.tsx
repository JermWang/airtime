"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { useBoard } from "@/lib/hooks";
import { useStation } from "@/lib/store";
import { useLiveAsk } from "./AskTicker";
import type { BoardRowDto } from "@/lib/api";
import { formatWei, formatDurationSec, cn } from "@/lib/format";

/**
 * "Buy airtime" asks one question: a show, or an ad?
 *
 * There is nothing to hunt for in the room. Runtime is the picture itself; an ad
 * is either the commercial break on that picture or one of the two panels beside
 * it. Every price is live and every one of them is falling.
 */

function Price({ row }: { row: BoardRowDto }) {
  const live = useLiveAsk(row.placement, row.surface);
  return (
    <span className="mono text-[18px] leading-none tracking-tight text-signal">{live ? formatWei(live.askWei) : "—"}</span>
  );
}

function Occupancy({ row }: { row: BoardRowDto }) {
  const occupant = row.surface.occupant;
  const live = useLiveAsk(row.placement, row.surface);
  if (occupant) {
    return (
      <>
        {occupant.displayName} is on it · {formatDurationSec(occupant.runtimeSec)} so far
      </>
    );
  }
  if (live && live.protectedForSec === 0 && live.askWei > live.floorWei) return <>falling to {formatWei(live.floorWei)}</>;
  return <>open</>;
}

function AdRow({ row, onPick }: { row: BoardRowDto; onPick: () => void }) {
  const isBreak = row.placement.availability.inventoryMode === "AD_BREAK";
  return (
    <button
      onClick={onPick}
      className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-left transition hover:border-signal/60 hover:bg-white/[0.05]"
      data-testid={`ad-surface-${row.placement.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-ink-50">{isBreak ? "In the commercial break" : row.placement.name}</div>
        <div className="mono truncate text-[9.5px] uppercase tracking-[0.12em] text-ink-500">
          {isBreak ? "full picture, every break" : "beside the picture, all the time"} · <Occupancy row={row} />
        </div>
      </div>
      <Price row={row} />
    </button>
  );
}

export function ProductChooser({ channelId = "MAIN", className }: { channelId?: string; className?: string }) {
  const { data } = useBoard(channelId);
  const focusPlacement = useStation((s) => s.focusPlacement);
  const setDrawer = useStation((s) => s.setDrawer);
  const [choice, setChoice] = useState<"none" | "ad">("none");

  const rows = data?.rows ?? [];
  const show = rows.find((r) => r.placement.kind === "show");
  const ads = rows.filter((r) => r.placement.kind === "ad" || r.placement.kind === "panel");
  const showLive = useLiveAsk(show?.placement, show?.surface);

  const pick = (id: string) => {
    focusPlacement(id);
    setDrawer("none");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn("glass-strong specular pointer-events-auto w-[min(94vw,560px)] rounded-2xl p-5", className)}
      data-testid="product-chooser"
    >
      <div className="mb-3.5">
        <div className="label-strong">What are you putting on?</div>
        <div className="mt-1 text-[11.5px] leading-relaxed text-ink-300">
          Every price starts at 0.01 ETH and falls until somebody buys. A sale resets it to twice what was paid, so the only thing that pushes a price up here is
          somebody else wanting it.
        </div>
      </div>

      {choice === "none" ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => show && pick(show.placement.id)}
            disabled={!show}
            className="group flex flex-1 flex-col rounded-xl border border-white/10 bg-black/40 p-4 text-left transition hover:border-signal/60 hover:bg-white/[0.04] disabled:opacity-40"
            data-testid="product-show"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="label-strong">A show</span>
              <span className="mono text-[9.5px] uppercase tracking-[0.14em] text-ink-500">up to 30 min</span>
            </div>
            <p className="mt-2 min-h-[56px] text-[12px] leading-relaxed text-ink-300">
              Takes the whole picture. It plays to everyone in the room, in sync, from the moment you buy it until somebody pays more.
            </p>
            <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-2.5">
              <span className="mono text-[9.5px] uppercase tracking-[0.14em] text-ink-500">{show?.surface.occupant ? "to take it" : "price now"}</span>
              <span className="mono text-[20px] leading-none tracking-tight text-signal">{showLive ? formatWei(showLive.askWei) : "—"}</span>
            </div>
            <span className="btn btn-sm mt-3 w-full justify-center group-hover:border-signal group-hover:text-signal">
              {show?.surface.occupant ? "Outbid them" : "Put on a show"}
            </span>
          </button>

          <button
            onClick={() => setChoice("ad")}
            className="group flex flex-1 flex-col rounded-xl border border-white/10 bg-black/40 p-4 text-left transition hover:border-signal/60 hover:bg-white/[0.04]"
            data-testid="product-ad"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="label-strong">An ad</span>
              <span className="mono text-[9.5px] uppercase tracking-[0.14em] text-ink-500">up to 30 sec</span>
            </div>
            <p className="mt-2 min-h-[56px] text-[12px] leading-relaxed text-ink-300">
              A spot in the break, or one of the two panels beside the picture. Runs for as long as you hold it. Much cheaper than a show.
            </p>
            <div className="mt-2 flex items-baseline justify-between border-t border-white/10 pt-2.5">
              <span className="mono text-[9.5px] uppercase tracking-[0.14em] text-ink-500">from</span>
              <span className="mono text-[20px] leading-none tracking-tight text-signal">
                {ads.length ? formatWei(ads.map((a) => BigInt(a.surface.askWei)).reduce((a, b) => (a < b ? a : b))) : "—"}
              </span>
            </div>
            <span className="btn btn-sm mt-3 w-full justify-center group-hover:border-signal group-hover:text-signal">Choose a spot</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {ads.map((row) => (
            <AdRow key={row.placement.id} row={row} onPick={() => pick(row.placement.id)} />
          ))}
          <button className="btn btn-ghost btn-sm mt-1 self-start" onClick={() => setChoice("none")}>
            Back
          </button>
        </div>
      )}

      {rows.length === 0 && <div className="label p-4">Reading the market…</div>}
    </motion.div>
  );
}
