"use client";

import Link from "next/link";
import { useQueue, useServerNow } from "@/lib/hooks";
import { useStation } from "@/lib/store";
import type { QueueEntryDto } from "@/lib/api";
import { formatClock, formatDurationSec, formatWei, cn, shortHash } from "@/lib/format";

/**
 * Public broadcast log: who is standing on which surface, and who was outbid off
 * one recently. Every entry is a real paid run; clicking one highlights or
 * focuses its physical placement. There is no "up next" — a surface has one
 * occupant and they hold it until somebody pays more.
 */
export function BroadcastLog({ channelId = "MAIN", className, compact = false }: { channelId?: string; className?: string; compact?: boolean }) {
  const { data, isLoading } = useQueue(channelId);
  const now = useServerNow(1000);
  const highlight = useStation((s) => s.highlightPlacement);
  const focus = useStation((s) => s.focusPlacement);
  const webgl = useStation((s) => s.webglAvailable);

  const Section = ({ title, entries, tone }: { title: string; entries: QueueEntryDto[]; tone?: "live" | "next" | "later" | "done" }) => (
    <div className="mb-4 last:mb-0">
      <div className="mb-1.5 flex items-center gap-2">
        {tone === "live" && entries.length > 0 && <span className="dot-live" />}
        <span className={cn("label", tone === "live" && entries.length > 0 && "text-live")}>{title}</span>
        <span className="label text-ink-500">{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/10 px-3 py-2 text-[11px] text-ink-400">{tone === "live" ? "No sponsored surfaces on air right now. Every one of them is open." : "Nothing yet."}</div>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map((e) => (
            <li key={e.id}>
              <button
                className="group flex w-full items-center gap-3 rounded-md border border-transparent px-2 py-1.5 text-left transition hover:border-white/10 hover:bg-white/[0.04]"
                onMouseEnter={() => highlight(e.placementId)}
                onMouseLeave={() => highlight(null)}
                onClick={() => {
                  if (webgl) focus(e.placementId);
                }}
              >
                <div className="h-8 w-14 shrink-0 overflow-hidden rounded-sm border border-white/10 bg-black">
                  {e.creative?.posterUrl || e.creative?.url ? (
                    e.creative.type === "VIDEO" && !e.creative.posterUrl ? (
                      <video src={e.creative.url ?? undefined} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.creative.posterUrl ?? e.creative.url ?? ""} alt="" className="h-full w-full object-cover" />
                    )
                  ) : (
                    <div className="mono flex h-full items-center justify-center text-[9px] text-signal">TXT</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-ink-50">{e.displayName}</div>
                  <div className="mono truncate text-[10px] uppercase tracking-[0.12em] text-ink-300">
                    {e.placementName}
                    {e.pricePaidWei ? ` · paid ${formatWei(e.pricePaidWei)}` : ""}
                  </div>
                </div>
                <div className="mono shrink-0 text-right text-[10px] tracking-[0.08em] text-ink-300">
                  <div suppressHydrationWarning>
                    {e.startsAt ? (e.endsAt ? `ran ${formatDurationSec(e.runtimeSec ?? 0)}` : `on air ${formatDurationSec(Math.max(0, Math.floor((now - new Date(e.startsAt).getTime()) / 1000)))}`) : "—"}
                  </div>
                  <div className="text-ink-500" suppressHydrationWarning>
                    {e.endedReason ? e.endedReason.toLowerCase().replace("_", " ") : e.startsAt ? `since ${formatClock(e.startsAt, false)}` : ""} · {e.wallet}
                  </div>
                </div>
                {!compact && e.txUrl && (
                  <a href={e.txUrl} target="_blank" rel="noreferrer" className="mono hidden shrink-0 text-[10px] text-signal opacity-0 transition group-hover:opacity-100 lg:block" onClick={(ev) => ev.stopPropagation()} title={e.txHash ?? ""}>
                    {shortHash(e.txHash)}
                  </a>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className={cn("scrollbar-thin overflow-y-auto", className)}>
      {isLoading && !data ? (
        <div className="label p-3">Loading broadcast log…</div>
      ) : (
        <>
          <Section title="On air" entries={data?.onAir ?? []} tone="live" />
          {!compact && (data?.recent.length ?? 0) > 0 && (
            <div>
              <div className="label mb-1.5">Came off air</div>
              <ul className="flex flex-col gap-1">
                {data!.recent.map((e) => (
                  <li key={e.id} className="flex items-center justify-between px-2 py-1 text-[11px]">
                    <span className="truncate text-ink-200">{e.displayName}</span>
                    <Link href={`/airlog/${e.id}`} className="mono text-[10px] uppercase tracking-[0.12em] text-signal">
                      AirLog
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
