"use client";

import { useMemo } from "react";
import { useServerNow } from "@/lib/hooks";
import { computeAsk, descentProgress } from "@/lib/auction";
import type { PlacementDto, SurfaceDto } from "@/lib/api";
import { formatWei, formatDurationSec, cn } from "@/lib/format";

/**
 * The live ask for a surface.
 *
 * The server signs the price, but it only gets polled every few seconds, so the
 * number here is recomputed locally from the same curve the server uses. The two
 * agree to the wei because they run the identical function.
 */
export function useLiveAsk(placement: PlacementDto | undefined, surface: SurfaceDto | undefined) {
  const now = useServerNow(500);
  // Both can be absent for a frame or two while the board loads, and a hook may
  // not bail out early, so the guard belongs inside.
  const auction = placement?.auction;
  return useMemo(() => {
    if (!surface || !auction) return null;
    const ask = computeAsk({
      auction,
      lastClearingPriceWei: BigInt(surface.lastClearingPriceWei || "0"),
      askResetAtMs: new Date(surface.askResetAt).getTime(),
      occupied: Boolean(surface.occupant),
      nowMs: now,
    });
    return { ...ask, progress: descentProgress(ask), nowMs: now };
  }, [auction, surface, now]);
}

interface Props {
  placement: PlacementDto;
  surface: SurfaceDto | undefined;
  className?: string;
}

/** Headline price panel: what this surface costs to take, right now. */
export function AskTicker({ placement, surface, className }: Props) {
  const live = useLiveAsk(placement, surface);
  const now = useServerNow(500);

  if (!surface || !live) return <div className={cn("label", className)}>Reading the market…</div>;

  const occupant = surface.occupant;
  const heldFor = occupant ? Math.max(0, Math.floor((now - new Date(occupant.since).getTime()) / 1000)) : 0;
  const atFloor = live.askWei === live.floorWei;

  return (
    <div className={cn("rounded-lg border border-white/10 bg-black/30 p-3", className)} data-testid="ask-ticker" data-status={surface.status}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="label">{occupant ? "Price to take it" : "Price now"}</span>
        <span className="mono text-[24px] leading-none tracking-tight text-signal" data-testid="ask-amount">
          {formatWei(live.askWei)}
        </span>
      </div>

      {/* Where the price sits between the top of this descent and its floor. */}
      <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-signal/70 transition-[width] duration-500" style={{ width: `${Math.round((1 - live.progress) * 100)}%` }} />
      </div>
      <div className="mono mt-1 flex justify-between text-[9.5px] uppercase tracking-[0.12em] text-ink-500">
        <span>{formatWei(live.floorWei)}</span>
        <span>{formatWei(live.anchorWei)}</span>
      </div>

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-300">
        {live.protectedForSec > 0 ? (
          <>
            Guaranteed runtime: this surface cannot be taken for another {formatDurationSec(live.protectedForSec)}. The price starts falling after that.
          </>
        ) : atFloor ? (
          occupant ? (
            <>This is the least it can be taken for while {occupant.displayName} is on it. It stays here until somebody pays it.</>
          ) : (
            <>The price has reached its floor and stays here until somebody takes the surface.</>
          )
        ) : (
          <>
            Falling to {formatWei(live.floorWei)} over the next {formatDurationSec(live.secondsToFloor)}. Buy whenever the number is worth it to you.
          </>
        )}
      </p>

      {occupant ? (
        <div className="mt-2.5 border-t border-white/10 pt-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="label">On it now</span>
            <span className="mono text-[10.5px] text-ink-300">{formatDurationSec(heldFor)} so far</span>
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-ink-50">{occupant.displayName}</div>
          <div className="mono text-[10px] uppercase tracking-[0.12em] text-ink-400">paid {formatWei(occupant.pricePaidWei)} · runs until outbid</div>
        </div>
      ) : (
        <div className="mono mt-2.5 border-t border-white/10 pt-2.5 text-[10px] uppercase tracking-[0.12em] text-ink-400">
          Nobody on this surface · you would run until somebody outbids you
        </div>
      )}

      {surface.status === "HELD" && (
        <div className="mono mt-2 text-[10px] uppercase tracking-[0.12em] text-amber">Another buyer is mid-purchase. The ask is theirs until their hold lapses.</div>
      )}
    </div>
  );
}

/** One-line version for lists: the ask plus who is on it. */
export function AskLine({ placement, surface }: { placement: PlacementDto; surface: SurfaceDto | undefined }) {
  const live = useLiveAsk(placement, surface);
  if (!surface || !live) return <span className="mono text-[10px] text-ink-500">—</span>;
  return (
    <span className="mono text-[10px] tracking-[0.08em]">
      <span className="text-signal">{formatWei(live.askWei)}</span>
      <span className="text-ink-500"> {surface.occupant ? "to take" : "now"}</span>
    </span>
  );
}
