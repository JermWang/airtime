"use client";

import Link from "next/link";
import { useBroadcastState, useServerNow } from "@/lib/hooks";
import { useStation } from "@/lib/store";
import { usePlayer } from "@/components/station/playerStore";
import { Wordmark } from "./Wordmark";
import { WalletButton } from "./WalletButton";
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
  const muted = useStation((s) => s.muted);
  const setMuted = useStation((s) => s.setMuted);
  const mode = useStation((s) => s.mode);
  const setMode = useStation((s) => s.setMode);
  const focusPlacement = useStation((s) => s.focusPlacement);
  const setDrawer = useStation((s) => s.setDrawer);

  const nowBlock = data?.now;
  const isLive = nowBlock?.type === "LIVE_HLS";
  const programTitle = source?.kind === "ad-video" || source?.kind === "ad-image" ? `${source.campaign.displayName} · commercial` : nowBlock?.title ?? "—";

  return (
    <div className={cn("pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between p-3 md:p-5")}>
      <div className="pointer-events-auto flex items-center gap-3 md:gap-5">
        <Link href="/" className="flex items-center" onClick={() => focusPlacement(null)}>
          <Wordmark size={compact ? 13 : 15} />
        </Link>
        <span className="hidden h-4 w-px bg-white/15 md:block" />
        <span className={cn("chip", isLive ? "chip-live" : playing ? "chip-signal" : "")}>
          {isLive ? <span className="dot-live" /> : <span className={cn("h-1.5 w-1.5 rounded-full", playing ? "bg-signal" : "bg-ink-400")} />}
          {isLive ? "Live" : playing ? "On air" : "Stand by"}
        </span>
        <span className="mono hidden max-w-[36vw] truncate text-[11px] uppercase tracking-[0.16em] text-ink-200 md:block">{programTitle}</span>
        <span className="mono hidden text-[11px] tracking-[0.12em] text-ink-300 lg:block" suppressHydrationWarning>
          {formatClock(now)} UTC
        </span>
      </div>
      <div className="pointer-events-auto flex items-center gap-2">
        <button className="btn btn-ghost btn-sm" onClick={() => setMuted(!muted)} aria-pressed={!muted} title={muted ? "Unmute" : "Mute"}>
          {muted ? "Muted" : "Sound on"}
        </button>
        <Link href="/treasury" className="btn btn-ghost btn-sm hidden lg:inline-flex" title="Ad revenue and token tax buy Anduril pre-stock for holders">
          Treasury
        </Link>
        <Link href="/queue" className="btn btn-ghost btn-sm hidden md:inline-flex" onClick={(e) => { if (window.location.pathname === "/") { e.preventDefault(); setDrawer("queue"); } }}>
          Broadcast log
        </Link>
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
