"use client";

import Link from "next/link";
import { useBoard } from "@/lib/hooks";
import { useStation } from "@/lib/store";
import { AskLine } from "@/components/airtime/AskTicker";
import type { PlacementDto, BoardRowDto } from "@/lib/api";
import { formatDurationSec, cn } from "@/lib/format";

const TYPE_LABEL: Record<PlacementDto["type"], string> = {
  FULLSCREEN: "Full screen",
  OVERLAY: "Overlay",
  ENVIRONMENT: "3D studio",
  SPONSORSHIP: "Sponsorship",
};

/**
 * The price board: every surface, what it costs to take right now, and who is
 * standing on it. This is the inventory list for people who would rather read a
 * table than walk around the room.
 */
export function InventoryList({ channelId = "MAIN", onSelect, className, linkMode = false }: { channelId?: string; onSelect?: (p: PlacementDto) => void; className?: string; linkMode?: boolean }) {
  const { data } = useBoard(channelId);
  const highlight = useStation((s) => s.highlightPlacement);
  const groups = new Map<PlacementDto["type"], BoardRowDto[]>();
  for (const row of data?.rows ?? []) groups.set(row.placement.type, [...(groups.get(row.placement.type) ?? []), row]);

  return (
    <div className={cn("scrollbar-thin overflow-y-auto", className)}>
      {[...groups.entries()].map(([type, list]) => (
        <div key={type} className="mb-4">
          <div className="label mb-1.5">{TYPE_LABEL[type]}</div>
          <ul className="flex flex-col gap-1">
            {list.map(({ placement: p, surface, occupant }) => {
              const inner = (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[12.5px] text-ink-50">{p.name}</span>
                      {occupant ? <span className="chip chip-live">taken</span> : <span className="chip chip-signal">open</span>}
                      {p.requiresModeration && <span className="chip">review</span>}
                    </div>
                    <div className="mono truncate text-[10px] uppercase tracking-[0.12em] text-ink-400">
                      {occupant ? `${occupant.displayName} · ${formatDurationSec(surface.occupant?.runtimeSec ?? 0)} on air` : `${p.aspectRatio} · ${p.mediaTypes.join("/")}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <AskLine placement={p} surface={surface} />
                    <div className="mono text-[9px] uppercase tracking-[0.12em] text-ink-500">
                      {surface.status === "PROTECTED" ? "guaranteed run" : surface.status === "HELD" ? "held" : surface.status === "CLOSED" ? "closed" : "falling"}
                    </div>
                  </div>
                </>
              );
              const cls = "flex w-full items-center gap-3 rounded-md border border-transparent px-2 py-1.5 text-left transition hover:border-white/10 hover:bg-white/[0.04]";
              return (
                <li key={p.id} onMouseEnter={() => highlight(p.id)} onMouseLeave={() => highlight(null)}>
                  {linkMode ? (
                    <Link href={`/airtime/${p.id}`} className={cls}>
                      {inner}
                    </Link>
                  ) : (
                    <button className={cls} onClick={() => onSelect?.(p)}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {!data && <div className="label p-2">Reading the market…</div>}
    </div>
  );
}
