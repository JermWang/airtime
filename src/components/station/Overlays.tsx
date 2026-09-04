"use client";

import { useMemo } from "react";
import { useActivations } from "@/lib/hooks";
import { useStation } from "@/lib/store";
import type { QueueEntryDto } from "@/lib/api";

/**
 * DOM overlays for the 2D station picture: lower third, sponsor bug, ticker.
 * Data-driven by placement `kind`; a preview (WYSIWYG) replaces the live
 * creative of the focused placement while the advertiser is editing.
 */
export function Overlays({ channelId = "MAIN" }: { channelId?: string }) {
  const { data } = useActivations(channelId);
  const preview = useStation((s) => s.preview);
  const focused = useStation((s) => s.focusedPlacementId);
  const safeZones = useStation((s) => s.showSafeZones);

  const byKind = useMemo(() => {
    const map = new Map<string, QueueEntryDto>();
    for (const e of data?.active ?? []) if (e.placementType === "OVERLAY") map.set(e.placementKind, e);
    return map;
  }, [data]);

  const previewKind = focused && preview ? focusedKind(focused) : null;
  const lower = previewKind === "lower_third" ? preview : byKind.get("lower_third")?.creative ?? null;
  const bug = previewKind === "sponsor_bug" ? preview : byKind.get("sponsor_bug")?.creative ?? null;
  const ticker = previewKind === "ticker" ? preview : byKind.get("ticker")?.creative ?? null;

  const lowerUrl = lower && "url" in lower ? lower.url : null;
  const bugUrl = bug && "url" in bug ? bug.url : null;
  const tickerText = ticker ? ("text" in ticker ? ticker.text : (ticker as { textContent?: string | null }).textContent) : null;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {safeZones && <div className="absolute inset-[5%] border border-dashed border-signal/50" />}
      {bugUrl && (
        <div className="absolute right-[4%] top-[5%] h-[9%] aspect-square">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bugUrl} alt="" className="h-full w-full object-contain drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]" />
        </div>
      )}
      {lowerUrl && (
        <div className="absolute bottom-[14%] left-[5%] w-[60%] aspect-[8/1]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lowerUrl} alt="" className="h-full w-full object-contain object-left drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)]" />
        </div>
      )}
      {tickerText && (
        <div className="absolute inset-x-0 bottom-0 flex h-[7%] min-h-[26px] items-center overflow-hidden border-t border-white/10 bg-black/70 backdrop-blur-sm">
          <div className="label-strong shrink-0 border-r border-white/15 px-3 text-signal">AIRTIME</div>
          <div className="mono ticker-track pl-4 text-[clamp(11px,1.2vw,16px)] uppercase tracking-[0.12em] text-ink-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="pr-16">
                {tickerText}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function focusedKind(placementId: string): string | null {
  // Placement kinds are data-driven; the UI store keeps a cache keyed by id.
  return placementKindCache.get(placementId) ?? null;
}

export const placementKindCache = new Map<string, string>();
