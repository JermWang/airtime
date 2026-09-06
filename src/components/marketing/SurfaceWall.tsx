"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useBoard, useActivations } from "@/lib/hooks";
import { useLiveAsk } from "@/components/airtime/AskTicker";
import { StationPlayer } from "@/components/station/StationPlayer";
import { usePlayer } from "@/components/station/playerStore";
import { formatWei, cn } from "@/lib/format";
import type { BoardRowDto, QueueEntryDto } from "@/lib/api";

/**
 * The wall, flattened.
 *
 * The theatre has one picture with a display panel either side of it, and this
 * is that arrangement laid out across the fold: the live programme in the
 * middle at full height, the two panels holding it. Each surface wears its own
 * price, so the first thing anybody sees is that all four are for sale and what
 * they cost right now.
 *
 * Nothing here is a mock-up of a screen. The middle is the station player and
 * the panels show whatever creative is actually running on them.
 */

function Chip({ children, className, stack }: { children: React.ReactNode; className?: string; stack?: boolean }) {
  return (
    <span
      className={cn(
        "mono inline-flex whitespace-nowrap rounded-sm border border-white/10 bg-ink-950/80 px-2 py-[5px] text-[9.5px] uppercase tracking-[0.14em] text-ink-200",
        // A side panel is narrower than this chip is long, and the surface
        // clips its own overflow, so on a panel the price sits under its label
        // rather than beside it.
        stack ? "flex-col items-start gap-[3px]" : "items-center gap-2",
        className,
      )}
    >
      {children}
    </span>
  );
}

function PriceChip({ row, label, stack }: { row: BoardRowDto | undefined; label: string; stack?: boolean }) {
  const live = useLiveAsk(row?.placement, row?.surface);
  return (
    <Chip stack={stack}>
      {label}
      <span className="text-signal">{live ? formatWei(live.askWei) : "—"}</span>
    </Chip>
  );
}

/** Four corner brackets, turned inward once the wall already fills the screen. */
function ExpandGlyph({ expanded }: { expanded?: boolean }) {
  const out = "M1 4.5V1h3.5M8.5 1H12v3.5M12 8.5V12H8.5M4.5 12H1V8.5";
  const inward = "M4.5 1v3.5H1M12 4.5H8.5V1M8.5 12V8.5H12M1 8.5h3.5V12";
  return (
    <svg viewBox="0 0 13 13" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" aria-hidden="true">
      <path d={expanded ? inward : out} />
    </svg>
  );
}

/** A display panel: the creative on it, or the fact that it is free. */
function PanelSurface({ row, occupant, side }: { row: BoardRowDto | undefined; occupant: QueueEntryDto | null; side: "left" | "right" }) {
  const creative = occupant?.creative ?? null;
  return (
    <Link
      href={row ? `/airtime/${row.placement.id}` : "/airtime"}
      className={cn(
        "group relative block h-full min-w-0 w-full overflow-hidden border-x border-white/[0.07] bg-ink-900",
        side === "left" ? "max-sm:col-start-1 max-sm:row-start-2" : "max-sm:col-start-2 max-sm:row-start-2",
      )}
      aria-label={row ? `${row.placement.name} — ${occupant ? "held" : "open"}` : "Display panel"}
    >
      <div className="absolute inset-0">
        {creative?.url ? (
          creative.type === "VIDEO" ? (
            <video src={creative.url} muted playsInline loop autoPlay className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creative.posterUrl ?? creative.url} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          // Nothing running: the surface reads as an empty lit panel, not as a
          // picture of one.
          <div className="h-full w-full bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,255,255,0.06),transparent_70%)]">
            <div className="mono absolute inset-x-0 top-1/2 -translate-y-1/2 px-4 text-center text-[9.5px] uppercase leading-relaxed tracking-[0.18em] text-ink-600 transition group-hover:text-ink-400">
              Available
            </div>
          </div>
        )}
      </div>
      {/* Anchored to both edges so the chip can never run past the surface;
          the compact size holds until lg, where the column is wide enough. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-2.5 bottom-2.5 flex max-lg:inset-x-1.5 max-lg:bottom-2",
          side === "left" ? "justify-start" : "justify-end",
        )}
      >
        <span className="min-w-0 max-w-full [&>span]:max-w-full [&>span]:max-lg:gap-[2px] [&>span]:max-lg:px-1.5 [&>span]:max-lg:text-[8px] [&>span]:max-lg:tracking-[0.08em]">
          <PriceChip row={row} label={side === "left" ? "Panel left" : "Panel right"} stack />
        </span>
      </div>
    </Link>
  );
}

export interface SurfaceWallProps {
  channelId?: string;
  /**
   * Sizing for the wall itself. The wall normally takes whatever height is left
   * over beside the copy under it; expanded, the fold hands it a fixed height
   * instead, so this replaces the flex rule rather than fighting it — `cn` here
   * is a plain join and would emit both.
   */
  sizeClassName?: string;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export function SurfaceWall({ channelId = "MAIN", sizeClassName, expanded, onToggleExpand }: SurfaceWallProps) {
  const { data: board } = useBoard(channelId);
  const { data: activations } = useActivations(channelId);
  const playing = usePlayer((s) => s.playing);

  const rows = useMemo(() => board?.rows ?? [], [board]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.placement.id, r])), [rows]);
  const occupantByPlacement = useMemo(() => {
    const m = new Map<string, QueueEntryDto>();
    for (const e of activations?.active ?? []) m.set(e.placementId, e);
    return m;
  }, [activations]);

  const show = rows.find((r) => r.placement.kind === "show");
  const ad = rows.find((r) => r.placement.kind === "ad");
  const left = byId.get("PANEL_LEFT");
  const right = byId.get("PANEL_RIGHT");

  return (
    <div
      className={cn(
        "grid min-h-16 grid-cols-2 grid-rows-[minmax(0,1fr)_96px] items-stretch justify-items-stretch gap-[3px] sm:grid-cols-[clamp(96px,18vw,120px)_minmax(0,1fr)_clamp(96px,18vw,120px)] sm:grid-rows-1 md:grid-cols-[clamp(120px,15vw,180px)_minmax(0,1fr)_clamp(120px,15vw,180px)]",
        sizeClassName ?? "flex-1",
      )}
    >
      <PanelSurface row={left} occupant={occupantByPlacement.get("PANEL_LEFT") ?? null} side="left" />

      <div className="relative min-w-0 w-full overflow-hidden bg-ink-900 max-sm:col-span-2 max-sm:col-start-1 max-sm:row-start-1">
        <div className="absolute inset-0">
          {/* The side inventory narrows this frame at some viewport sizes. Keep
              the complete 16:9 programme visible instead of cropping it to the
              changing display ratio. */}
          <StationPlayer channelId={channelId} visible fit="contain" className="h-full w-full" overlays={false} />
        </div>
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
          <PriceChip row={show} label="Runtime" />
          <PriceChip row={ad} label="Commercial" />
        </div>
        <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2 sm:bottom-auto sm:right-3 sm:top-3">
          <span className="mono inline-flex items-center gap-[7px] rounded-sm border border-signal/40 bg-ink-950/80 px-2 py-[5px] text-[9.5px] uppercase tracking-[0.16em] text-signal">
            <span className="h-[5px] w-[5px] rounded-full bg-signal shadow-[0_0_8px_rgba(204,255,0,0.8)]" />
            {playing ? "On air" : "Stand by"}
          </span>
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-pressed={expanded}
              aria-label={expanded ? "Collapse the wall" : "Expand the wall to fill the screen"}
              data-testid="wall-expand"
              className="mono pointer-events-auto inline-flex items-center gap-[7px] rounded-sm border border-white/20 bg-ink-950/80 px-2 py-[5px] text-[9.5px] uppercase tracking-[0.16em] text-ink-200 transition hover:border-white/45 hover:text-ink-50 max-sm:px-2.5 max-sm:py-2"
            >
              <ExpandGlyph expanded={expanded} />
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
        </div>
      </div>

      <PanelSurface row={right} occupant={occupantByPlacement.get("PANEL_RIGHT") ?? null} side="right" />
    </div>
  );
}

/**
 * The strip under the fold: every surface and its price, running past.
 *
 * The list is doubled and the track is translated by half its width, which is
 * what makes the loop seamless; the copy is hidden from assistive technology so
 * the prices are not announced twice.
 */
export function PriceTicker({ channelId = "MAIN", seconds = 90 }: { channelId?: string; seconds?: number }) {
  const { data } = useBoard(channelId);
  const rows = (data?.rows ?? []).filter((r) => r.placement.isActive);
  if (!rows.length) return null;

  const Run = ({ hidden }: { hidden?: boolean }) => (
    <div className="flex items-center" aria-hidden={hidden}>
      {rows.map((r) => (
        <TickerItem key={r.placement.id} row={r} />
      ))}
      <span className="mono inline-flex items-center whitespace-nowrap px-10 py-[13px] text-[10.5px] uppercase tracking-[0.16em] text-ink-300">
        Prices fall until somebody takes them
      </span>
    </div>
  );

  return (
    <div className="relative w-full overflow-hidden border-y border-white/[0.09] bg-ink-900">
      <div className="ticker-track flex w-max" style={{ animationDuration: `${seconds}s` }}>
        <Run />
        <Run hidden />
      </div>
    </div>
  );
}

function TickerItem({ row }: { row: BoardRowDto }) {
  const live = useLiveAsk(row.placement, row.surface);
  return (
    <Link href={`/airtime/${row.placement.id}`} className="mono inline-flex items-baseline gap-3.5 whitespace-nowrap px-10 py-[13px] text-[10.5px] uppercase tracking-[0.16em]">
      <span className="text-ink-300">{row.placement.name}</span>
      <span className="text-signal tabular-nums">{live ? formatWei(live.askWei) : "—"}</span>
      <span className="text-ink-300">{row.surface.occupant ? "held" : row.surface.forSale ? "open" : "closed"}</span>
    </Link>
  );
}
