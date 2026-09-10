"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import styles from "./SurfaceWall.module.css";
import Link from "next/link";
import { useBoard, useActivations, useBroadcastState, useHousePlaceholder } from "@/lib/hooks";
import { useLiveAsk } from "@/components/airtime/AskTicker";
import { StationPlayer } from "@/components/station/StationPlayer";
import { usePlayer } from "@/components/station/playerStore";
import { HouseCard } from "@/components/hud/HouseCard";
import { houseMedia } from "@/lib/house";
import { formatWei, cn } from "@/lib/format";
import { useMarquee } from "@/lib/useMarquee";
import type { BoardRowDto, QueueEntryDto } from "@/lib/api";

/**
 * A dimensional display district with live placement previews.
 *
 * The theatre has one picture with a display panel either side of it, and this
 * is that arrangement laid out across the fold: the live programme in the
 * middle at full height, the two panels holding it. Each surface wears its own
 * price, so the first thing anybody sees is which surfaces are for sale and what
 * they cost right now.
 *
 * Nothing here is a mock-up of a screen. The middle is the station player and
 * the panels show whatever creative is actually running on them.
 */

/**
 * Sizes are chosen here rather than overridden by the caller: `cn` is a plain
 * join, so a caller passing px-1 next to the base px-2 emits both and the
 * stylesheet decides which wins, which is how the compact chip came out at
 * full size on the smallest surface it exists for.
 */
function Chip({ children, className, stack, compact }: { children: React.ReactNode; className?: string; stack?: boolean; compact?: boolean }) {
  return (
    <span
      className={cn(
        "readout inline-flex whitespace-nowrap rounded-sm border border-white/10 bg-ink-950/80 uppercase text-ink-200",
        compact ? "min-w-0 max-w-full px-1 py-[2px] text-[7.5px] tracking-[0.06em]" : "px-2 py-[5px] text-[9.5px] tracking-[0.14em]",
        stack ? "flex-col items-start gap-[3px]" : compact ? "items-center gap-1" : "items-center gap-2",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A surface's name and what it costs, on one line.
 *
 * The price used to sit under its label on a panel, which cost the card a
 * second row of height on the smallest surfaces the station sells — half the
 * space the creative had. They share a line now, and the name gives way first:
 * on a surface too narrow for both, the label truncates and the price stays
 * whole, because the price is the reason the chip is there.
 */
function PriceChip({ row, label, stack, compact }: { row: BoardRowDto | undefined; label: string; stack?: boolean; compact?: boolean }) {
  const live = useLiveAsk(row?.placement, row?.surface);
  return (
    <Chip stack={stack} compact={compact}>
      {/* The name of the surface only appears where there is room for it: on a
          seventy-pixel tower it came out as "T…", which is noise standing in
          front of the price. Measured against the panel, not the window. */}
      <span className={compact ? "hidden min-w-0 truncate @[124px]:inline" : undefined}>{label}</span>
      <span className="shrink-0 text-signal">{live ? formatWei(live.askWei) : "—"}</span>
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

/**
 * The panels around the picture and where each one sits.
 *
 * The wall is a cluster, not a row: three across the top, one either side of
 * the picture, and a portrait tower standing outboard at the full height of it.
 * Narrow screens cannot hold that, so the picture takes the first row on its
 * own and the panels stack into two rows of three underneath.
 *
 * Which surfaces exist is still data — these are the places the wall keeps for
 * them, and a panel with no placement behind it simply does not render.
 */
interface WallPanel {
  id: string;
  label: string;
  /** Where the chip sits, so it never runs off the outboard edge. */
  align: "start" | "end";
  area: string;
}

/**
 * The row above the picture keeps its own proportions rather than inheriting
 * the columns under it: two panels of the same size and a square at the end.
 * Sharing the picture's column would have stretched the middle one to eleven
 * times its height, and a spot delivered to a 16:9 surface would be cropped to
 * a letterbox slot.
 */
const TOP_PANELS: WallPanel[] = [
  { id: "PANEL_TOP_LEFT", label: "Top left", align: "start", area: "max-sm:col-start-1 max-sm:row-start-2" },
  { id: "PANEL_TOP_MID", label: "Top centre", align: "start", area: "max-sm:col-start-2 max-sm:row-start-2" },
  { id: "PANEL_TOP_RIGHT", label: "Top right", align: "end", area: "max-sm:col-start-3 max-sm:row-start-2" },
];

const WALL_PANELS: WallPanel[] = [
  { id: "PANEL_LEFT", label: "Panel left", align: "start", area: "max-sm:col-start-1 max-sm:row-start-3 sm:col-start-1 sm:row-start-2" },
  { id: "PANEL_RIGHT", label: "Panel right", align: "end", area: "max-sm:col-start-2 max-sm:row-start-3 sm:col-start-3 sm:row-start-2" },
  { id: "PANEL_TOWER", label: "Tower", align: "end", area: "max-sm:col-start-3 max-sm:row-start-3 sm:col-start-4 sm:row-start-1 sm:row-span-2" },
];

/**
 * The artwork's own edge colour, read from its top-left pixel.
 *
 * A logo shown whole on a surface that is not its shape needs ground to stand
 * on, and the ground it was drawn against is the honest choice: the panel then
 * looks like the mark on its own background rather than a picture with bars.
 * Same-origin artwork only, so the canvas is never tainted; if it is, the panel
 * keeps the background it already had.
 */
function useEdgeColor(url: string | null): string | null {
  const [color, setColor] = useState<string | null>(null);
  useEffect(() => {
    setColor(null);
    if (!url) return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        if (!cancelled) setColor(`rgb(${r} ${g} ${b})`);
      } catch {
        /* tainted canvas: leave the panel as it is */
      }
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return color;
}

/** A display panel: the creative on it, or the fact that it is free. */
function PanelSurface({ panel, row, occupant, onSelect, preview = false }: { panel: WallPanel; row: BoardRowDto | undefined; occupant: QueueEntryDto | null; onSelect?: () => void; preview?: boolean }) {
  const creative = occupant?.creative ?? null;
  // House content stands on the panel while it is unbooked, named for the brand
  // on it, with the panel still reading as available at its asking price.
  const card = useHousePlaceholder(occupant ? null : panel.id);
  const house = houseMedia(card);
  // Only artwork that asks to be shown whole gets a ground colour; everything
  // else fills its surface exactly as it always has.
  const showWhole = Boolean(house && house.kind === "image" && card?.fit === "FIT");
  const ground = useEdgeColor(showWhole ? house!.url : null);
  const brand = card?.slug === "rh-pump" ? "pump" : card?.slug === "rh-solana" ? "solana" : null;
  return (
    <Link
      href={row ? `/airtime/${row.placement.id}` : "/airtime"}
      onClick={onSelect ? (event) => { event.preventDefault(); onSelect(); } : undefined}
      data-surface={panel.id}
      className={cn("group @container relative flex h-full min-w-0 w-full flex-col bg-ink-900", preview ? "overflow-hidden" : styles.screen, !preview && panel.area)}
      aria-label={`${onSelect ? "Enlarge" : "View placement"} ${row?.placement.name ?? panel.label}`}
    >
      {/* Whatever is on the surface fills it corner to corner: a spot is not
          letterboxed above a bar of station furniture. The price floats over
          it, and the card inside keeps its own text clear of the chip. */}
      <div className={cn("absolute inset-0 overflow-hidden", !preview && styles.face)}>
        {creative?.url ? (
          creative.type === "VIDEO" ? (
            <video src={creative.url} muted playsInline loop autoPlay className={cn("h-full w-full bg-black", occupant?.fit === "FIT" ? "object-contain" : "object-cover")} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creative.url} alt={occupant?.displayName ?? "Advertisement"} className={cn("h-full w-full bg-black", occupant?.fit === "FIT" ? "object-contain" : "object-cover")} />
          )
        ) : house ? (
          <>
            {brand ? (
              <div className={styles.brandPanel} data-brand={brand}>
                <div className={styles.brandContent}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/placeholders/${brand}-mark.svg`} alt="" className={styles.brandLogo} />
                  <div className={styles.brandCopy}>
                    <small className={styles.brandEyebrow}>{brand === "pump" ? "PUMP.FUN" : "SOLANA"}</small>
                    <strong>{brand === "pump" ? "$PUMP" : <>Built for<br />what’s next.</>}</strong>
                    <span>{brand === "pump" ? "Pump.fun flagship token" : "Powered by SOL"}</span>
                    <small className={styles.brandCta}>{brand === "pump" ? "Explore $PUMP ↗" : "solana.com ↗"}</small>
                  </div>
                </div>
              </div>
            ) : house.kind === "video" ? (
              <video src={house.url} poster={house.posterUrl ?? undefined} muted playsInline loop autoPlay className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={house.url}
                alt=""
                className={cn("h-full w-full", showWhole ? "object-contain" : "object-cover")}
                style={showWhole && ground ? { background: ground } : undefined}
              />
            )}
            {card && (
              <span className="readout absolute left-1.5 top-1.5 max-w-[calc(100%-12px)] truncate rounded-sm border border-white/25 bg-ink-950/80 px-1.5 py-[3px] text-[8px] uppercase tracking-[0.16em] text-ink-200">
                {card.label}
              </span>
            )}
          </>
        ) : creative?.textContent ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-2xl">{creative.textContent}</div>
        ) : card ? (
          <div className={styles.house}><HouseCard card={card} /></div>
        ) : (
          // Nothing running: the surface reads as an empty lit panel, not as a
          // picture of one.
          <div className={styles.idle}>
            <span className="absolute left-2 top-2 text-[8px] uppercase tracking-widest text-white/70">Airtime / House display</span>
            <div className="readout absolute inset-x-0 top-1/2 -translate-y-1/2 px-4 text-center text-[9.5px] uppercase leading-relaxed tracking-[0.18em] text-white transition group-hover:text-signal">
              Available
            </div>
          </div>
        )}
      </div>
      {/* Anchored to both edges so the chip can never run past the surface. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-1.5 bottom-1.5 flex min-w-0 items-end",
          panel.align === "start" ? "justify-start" : "justify-end",
        )}
      >
        {/* A flex box, not an inline span: max-width on an inline wrapper does
            not reach the chip inside it, and the price ran off the tower. */}
        <span className="flex min-w-0 max-w-full">
          <PriceChip row={row} label={panel.label} compact />
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  // The picture is two products, and which one a click is about depends on
  // what is on it: the commercial owns the screen through a break, the show
  // owns it the rest of the time. Read off the schedule, not off a guess.
  const { data: broadcast } = useBroadcastState(channelId);
  const mainRow = (broadcast?.now?.type === "AD_BREAK" ? ad : show) ?? show ?? ad;
  const panels = WALL_PANELS.filter((p) => byId.has(p.id));
  const selected = rows.find((row) => row.placement.id === selectedId);
  const topPanels = TOP_PANELS.filter((p) => byId.has(p.id));

  return (
    <div className={cn(styles.district, sizeClassName ?? "flex-1")}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className="readout relative z-10 flex justify-between gap-4 px-5 py-4 text-[9px] uppercase tracking-[0.18em] text-ink-200"><span>Main / Display district</span><span>Click a screen to explore ↗</span></div>
    <div
      className={cn(
        styles.skyline,
        "grid flex-1 grid-cols-3 grid-rows-[minmax(220px,1fr)_100px_100px] items-stretch justify-items-stretch gap-3 sm:gap-5 sm:grid-rows-[clamp(90px,10vw,150px)_minmax(230px,1fr)] sm:grid-cols-[clamp(84px,12vw,180px)_minmax(0,1fr)_clamp(84px,12vw,180px)_clamp(64px,10vw,150px)]",
      )}
    >
      {topPanels.length > 0 && (
        <div className="max-sm:contents sm:grid sm:min-w-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.46fr)] sm:gap-3 sm:col-span-3 sm:col-start-1 sm:row-start-1">
          {topPanels.map((panel) => (
            <PanelSurface key={panel.id} panel={panel} row={byId.get(panel.id)} occupant={occupantByPlacement.get(panel.id) ?? null} />
          ))}
        </div>
      )}

      {panels.map((panel) => (
        <PanelSurface key={panel.id} panel={panel} row={byId.get(panel.id)} occupant={occupantByPlacement.get(panel.id) ?? byId.get(panel.id)?.occupant ?? null} onSelect={() => setSelectedId(panel.id)} />
      ))}

      <div className={cn(styles.mainScreen, "relative min-w-0 w-full bg-ink-900 max-sm:col-span-3 max-sm:col-start-1 max-sm:row-start-1 sm:col-start-2 sm:row-start-2")}>
        <div className="absolute inset-0">
          {/* The side inventory narrows this frame at some viewport sizes. Keep
              the complete 16:9 programme visible instead of cropping it to the
              changing display ratio. */}
          <StationPlayer channelId={channelId} visible fit="contain" className="h-full w-full" overlays={false} />
        </div>
        {/*
          The picture is inventory like every other surface, so it answers to a
          click like one. Deliberately unstacked: the chips and the expand
          button are later siblings with no z-index of their own, so they stay
          above this and keep their own jobs.
        */}
        {mainRow && (
          <button
            type="button"
            onClick={() => setSelectedId(mainRow.placement.id)}
            aria-label={`Buy ${mainRow.placement.name}`}
            className="group/main absolute inset-0 cursor-pointer transition hover:ring-2 hover:ring-inset hover:ring-signal/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal"
          >
            <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-[linear-gradient(to_top,rgba(0,0,0,0.78),transparent)] pb-4 pt-12 opacity-0 transition duration-200 group-hover/main:opacity-100 group-focus-visible/main:opacity-100">
              <span className="readout rounded-sm border border-signal/50 bg-ink-950/85 px-3 py-[7px] text-[10px] uppercase tracking-[0.18em] text-signal">
                Buy {mainRow.placement.kind === "ad" ? "the commercial" : "the runtime"} ↗
              </span>
            </span>
          </button>
        )}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
          {[show, ad].map((row) => row && <button type="button" key={row.placement.id} onClick={() => setSelectedId(row.placement.id)} className="pointer-events-auto" aria-label={`View ${row.placement.name} details`}><PriceChip row={row} label={row.placement.kind === "show" ? "Runtime ↗" : "Commercial ↗"} /></button>)}
        </div>
        <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2 sm:bottom-auto sm:right-3 sm:top-3">
          <span className="readout inline-flex items-center gap-[7px] rounded-sm border border-signal/40 bg-ink-950/80 px-2 py-[5px] text-[9.5px] uppercase tracking-[0.16em] text-signal">
            <span className="h-[5px] w-[5px] rounded-full bg-[#39d6a3] shadow-[0_0_8px_#39d6a3]" />
            {playing ? "On air" : "Stand by"}
          </span>
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-pressed={expanded}
              aria-label={expanded ? "Collapse the wall" : "Expand the wall to fill the screen"}
              data-testid="wall-expand"
              className="readout pointer-events-auto inline-flex items-center gap-[7px] rounded-sm border border-white/20 bg-ink-950/80 px-2 py-[5px] text-[9.5px] uppercase tracking-[0.16em] text-ink-200 transition hover:border-white/45 hover:text-ink-50 max-sm:px-2.5 max-sm:py-2"
            >
              <ExpandGlyph expanded={expanded} />
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
        </div>
      </div>

    </div>
    <div className={styles.floor} aria-hidden="true" />
    {selected && <SurfaceDetail row={selected} occupant={occupantByPlacement.get(selected.placement.id) ?? selected.occupant} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function SurfaceDetail({ row, occupant, onClose }: { row: BoardRowDto; occupant: QueueEntryDto | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const live = useLiveAsk(row.placement, row.surface);
  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  const panel = WALL_PANELS.find((item) => item.id === row.placement.id) ?? { id: row.placement.id, label: row.placement.name, align: "start" as const, area: "" };
  return (
    <dialog ref={dialog} className={styles.detail} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="surface-detail-title">
      <div className="relative grid overflow-hidden rounded-lg border border-white/20 bg-[#0b1015] md:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        <button type="button" autoFocus onClick={onClose} aria-label="Close placement details" className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/80 text-xl text-white">×</button>
        <div className="relative min-h-[260px] bg-black md:min-h-[480px]">
          <PanelSurface panel={panel} row={row} occupant={occupant} preview />
        </div>
        <div className="px-7 py-14 text-ink-100">
          <div className="readout text-[10px] uppercase tracking-[0.2em] text-signal">{row.surface.status} / {row.placement.kind}</div>
          <h2 id="surface-detail-title" className="mt-4 text-3xl tracking-tight">{row.placement.name}</h2>
          <p className="mt-4 text-sm leading-relaxed text-ink-300">{row.placement.description ?? "A place for your creative in the AIRTIME display district."}</p>
          <div className="mt-7 border-y border-white/10 py-5"><div className="readout text-[10px] uppercase tracking-widest text-ink-300">Current asking price</div><div className="mt-2 text-3xl text-signal">{formatWei(live?.askWei ?? row.surface.askWei)}</div></div>
          <dl className="mt-5 grid grid-cols-2 gap-5 text-sm"><div><dt className="text-ink-400">Screen format</dt><dd className="mt-1">{row.placement.aspectRatio}</dd></div><div><dt className="text-ink-400">Accepts</dt><dd className="mt-1">{row.placement.mediaTypes.join(" / ").toLowerCase()}</dd></div><div className="col-span-2"><dt className="text-ink-400">On this screen</dt><dd className="mt-1">{occupant?.displayName ?? "House display · available inventory"}</dd></div></dl>
          {occupant?.clickUrl && /^https?:\/\//i.test(occupant.clickUrl) && <a href={occupant.clickUrl} target="_blank" rel="noopener noreferrer" className="mt-4 block break-all text-sm text-signal">Visit advertiser ↗ · {occupant.clickUrl}</a>}
          {row.surface.reason && <p className="mt-4 text-sm text-ink-300">{row.surface.reason}</p>}
          <Link href={`/airtime/${row.placement.id}`} className="mt-7 flex min-h-11 items-center justify-center rounded-sm bg-signal px-5 text-sm font-semibold text-black">{row.surface.forSale ? "Get this placement ↗" : "View placement ↗"}</Link>
        </div>
      </div>
    </dialog>
  );
}

/**
 * The strip under the fold: every surface and its price, running past.
 *
 * The list repeats as many times as it takes to outrun the strip and the track
 * is translated by exactly one copy, which is what makes the loop seamless: two
 * copies alone leave a gap once the list is narrower than the screen. Every copy
 * after the first is hidden from assistive technology so prices are not
 * announced twice.
 */
export function PriceTicker({ channelId = "MAIN", seconds = 90 }: { channelId?: string; seconds?: number }) {
  const { data } = useBoard(channelId);
  const rows = (data?.rows ?? []).filter((r) => r.placement.isActive);
  // Measured before the empty check, because a hook cannot sit behind a return.
  const { copies, shift, setViewport, setFirstRun } = useMarquee(rows.length);
  if (!rows.length) return null;

  const Run = ({ hidden, innerRef }: { hidden?: boolean; innerRef?: (node: HTMLElement | null) => void }) => (
    <div ref={innerRef} className="flex shrink-0 items-center" aria-hidden={hidden}>
      {rows.map((r) => (
        <TickerItem key={r.placement.id} row={r} />
      ))}
      <span className="readout inline-flex items-center whitespace-nowrap px-10 py-[13px] text-[10.5px] uppercase tracking-[0.16em] text-ink-300">
        Prices fall until somebody takes them
      </span>
    </div>
  );

  return (
    <div ref={setViewport} className="relative w-full overflow-hidden border-y border-white/[0.09] bg-ink-900">
      <div
        className="ticker-track flex w-max"
        style={{ animationDuration: `${seconds}s`, ...(shift === null ? null : { "--marquee-shift": `${shift}px` }) } as CSSProperties}
      >
        {Array.from({ length: copies }, (_, i) => (
          <Run key={i} hidden={i > 0} innerRef={i === 0 ? setFirstRun : undefined} />
        ))}
      </div>
    </div>
  );
}

function TickerItem({ row }: { row: BoardRowDto }) {
  const live = useLiveAsk(row.placement, row.surface);
  return (
    <Link href={`/airtime/${row.placement.id}`} className="readout inline-flex items-baseline gap-3.5 whitespace-nowrap px-10 py-[13px] text-[10.5px] uppercase tracking-[0.16em]">
      <span className="text-ink-300">{row.placement.name}</span>
      <span className="text-signal tabular-nums">{live ? formatWei(live.askWei) : "—"}</span>
      <span className="text-ink-300">{row.surface.occupant ? "held" : row.surface.forSale ? "open" : "closed"}</span>
    </Link>
  );
}
