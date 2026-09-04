"use client";

import Link from "next/link";
import { usePlacements } from "@/lib/hooks";
import { useStation } from "@/lib/store";
import type { PlacementDto } from "@/lib/api";
import { formatWei, formatDurationSec, cn } from "@/lib/format";

const TYPE_LABEL: Record<PlacementDto["type"], string> = {
  FULLSCREEN: "Full screen",
  OVERLAY: "Overlay",
  ENVIRONMENT: "3D studio",
  SPONSORSHIP: "Sponsorship",
};

/** Conventional inventory list for people who do not want to navigate the room. */
export function InventoryList({ channelId = "MAIN", onSelect, className, linkMode = false }: { channelId?: string; onSelect?: (p: PlacementDto) => void; className?: string; linkMode?: boolean }) {
  const { data } = usePlacements(channelId);
  const highlight = useStation((s) => s.highlightPlacement);
  const groups = new Map<PlacementDto["type"], PlacementDto[]>();
  for (const p of data?.placements ?? []) groups.set(p.type, [...(groups.get(p.type) ?? []), p]);

  return (
    <div className={cn("scrollbar-thin overflow-y-auto", className)}>
      {[...groups.entries()].map(([type, list]) => (
        <div key={type} className="mb-4">
          <div className="label mb-1.5">{TYPE_LABEL[type]}</div>
          <ul className="flex flex-col gap-1">
            {list.map((p) => {
              const inner = (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[12.5px] text-ink-50">{p.name}</span>
                      {p.requiresModeration && <span className="chip">review</span>}
                      {p.type === "ENVIRONMENT" && p.meshName && <span className="mono text-[9px] text-ink-500">{p.meshName}</span>}
                    </div>
                    <div className="mono truncate text-[10px] uppercase tracking-[0.12em] text-ink-400">
                      {p.aspectRatio} · {p.mediaTypes.join("/")} · {formatDurationSec(p.minDurationSec)}–{formatDurationSec(p.maxDurationSec)}
                    </div>
                  </div>
                  <div className="mono shrink-0 text-right text-[10px] tracking-[0.08em] text-ink-200">
                    <div>from {formatWei(p.basePriceWei)}</div>
                    <div className="text-ink-500">per {formatDurationSec(p.pricingRules.unitSeconds)}</div>
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
      {!data && <div className="label p-2">Loading inventory…</div>}
    </div>
  );
}
