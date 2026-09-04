"use client";

import Link from "next/link";
import { useBroadcastState, useServerNow } from "@/lib/hooks";
import { useStation } from "@/lib/store";
import { usePlayer } from "@/components/station/playerStore";
import { Wordmark } from "./Wordmark";
import { WalletButton } from "./WalletButton";
import { SoundControl } from "./SoundControl";
import { formatClock, cn } from "@/lib/format";

/**
 * Tiny status rail: AIRTIME · LIVE · program · server time · BUY AIRTIME.
 * Sits on top of the studio; never competes with the picture.
 */
export function StatusRail({ channelId = "MAIN", compact = false }: { channelId?: string; compact?: boolean }) {
  const { data } = useBroadcastState(channelId);
  const now = useServerNow(500);
  const playing = usePlayer((s) => s.playing);
  const source = usePlayer((s) => s.source);
  const mode = useStation((s) => s.mode);
  const setMode = useStation((s) => s.setMode);
  const focusPlacement = useStation((s) => s.focusPlacement);
  const setDrawer = useStation((s) => s.setDrawer);

  const nowBlock = data?.now;
  const isLive = nowBlock?.type === "LIVE_HLS";
  const programTitle =
    source?.kind === "campaign-video" || source?.kind === "campaign-image"
      ? `${source.campaign.displayName}${source.slot === "ad" ? " · commercial" : ""}`
      : nowBlock?.title ?? "—";

  return (
    <div className="glass-bar fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between gap-3 px-3 md:px-5">
      <div className="flex min-w-0 items-center gap-3 md:gap-4">
        <Link href="/" className="flex shrink-0 items-center" onClick={() => focusPlacement(null)}>
          <Wordmark size={compact ? 13 : 15} />
        </Link>
        <span className="hidden h-4 w-px shrink-0 bg-white/15 md:block" />
        <span className={cn("chip", isLive ? "chip-live" : playing ? "chip-signal" : "")}>
          {isLive ? <span className="dot-live" /> : <span className={cn("h-1.5 w-1.5 rounded-full", playing ? "bg-signal" : "bg-ink-400")} />}
          {isLive ? "Live" : playing ? "On air" : "Stand by"}
        </span>
        <span className="mono hidden max-w-[36vw] truncate text-[11px] uppercase tracking-[0.16em] text-ink-200 md:block">{programTitle}</span>
        <span className="mono hidden text-[11px] tracking-[0.12em] text-ink-300 lg:block" suppressHydrationWarning>
          {formatClock(now)} UTC
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        <SoundControl compact={compact} />
        <Link href="/treasury" className="btn btn-ghost hidden lg:inline-flex" title="Ad revenue and token tax buy Anduril pre-stock for holders">
          Treasury
        </Link>
        <Link href="/queue" className="btn btn-ghost hidden md:inline-flex" onClick={(e) => { if (window.location.pathname === "/") { e.preventDefault(); setDrawer("queue"); } }}>
          Broadcast log
        </Link>
        <span className="mx-1 hidden h-4 w-px bg-white/15 md:block" />
        <WalletButton />
        {!compact && (
          <button
            className={cn("btn hidden md:inline-flex", mode === "browse" ? "" : "btn-primary")}
            onClick={() => {
              if (mode === "browse") {
                setMode("watch");
              } else {
                focusPlacement(null);
                setMode("browse");
              }
            }}
          >
            {mode === "browse" ? "Done" : "Buy airtime"}
          </button>
        )}
      </div>
    </div>
  );
}
