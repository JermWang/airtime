"use client";

import { useGuide, useServerNow } from "@/lib/hooks";
import type { ProgramBlockDto } from "@/lib/api";
import { formatClock, formatDurationSec, cn } from "@/lib/format";

/** NOW / NEXT / LATER guide. Also used in full on /guide. */
export function ProgramGuide({ channelId = "MAIN", hours = 4, className, full = false }: { channelId?: string; hours?: number; className?: string; full?: boolean }) {
  const { data } = useGuide(channelId, hours);
  const now = useServerNow(1000);
  const blocks = (data?.blocks ?? []).filter((b) => new Date(b.endsAt).getTime() > now);
  const current = blocks.find((b) => new Date(b.startsAt).getTime() <= now);
  const upcoming = blocks.filter((b) => b !== current);

  const Row = ({ b, label }: { b: ProgramBlockDto; label?: string }) => {
    const start = new Date(b.startsAt).getTime();
    const end = new Date(b.endsAt).getTime();
    const progress = Math.min(1, Math.max(0, (now - start) / (end - start)));
    const isAd = b.type === "AD_BREAK";
    const poster = (b.metadata as { posterUrl?: string }).posterUrl;
    return (
      <li className={cn("relative flex items-center gap-3 rounded-md px-2 py-1.5", label === "NOW" && "bg-white/[0.04]")}>
        {full && (
          <div className="h-10 w-16 shrink-0 overflow-hidden rounded-sm border border-white/10 bg-black">
            {poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={poster} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className={cn("mono flex h-full items-center justify-center text-[9px]", isAd ? "text-signal" : "text-ink-400")}>{isAd ? "AD" : b.type}</div>
            )}
          </div>
        )}
        <div className="mono w-11 shrink-0 text-[10px] tracking-[0.1em] text-ink-300" suppressHydrationWarning>
          {formatClock(b.startsAt, false)}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-[12.5px]", isAd ? "text-ink-300" : "text-ink-50")}>
            {b.title}
            {b.isDevData && <span className="chip ml-2 align-middle">dev data</span>}
            {(b.metadata as { isPremium?: boolean }).isPremium && <span className="chip chip-signal ml-2 align-middle">premium</span>}
          </div>
          <div className="mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
            {label ?? (isAd ? "Commercial break" : b.type === "LIVE_HLS" ? "Live" : "Program")} · {formatDurationSec(b.durationSec)}
          </div>
          {label === "NOW" && (
            <div className="mt-1 h-px w-full bg-white/10">
              <div className="h-px bg-signal transition-[width] duration-1000" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className={cn("scrollbar-thin overflow-y-auto", className)}>
      <ul className="flex flex-col gap-0.5">
        {current && <Row b={current} label="NOW" />}
        {upcoming.slice(0, 1).map((b) => (
          <Row key={b.id} b={b} label="NEXT" />
        ))}
        {upcoming.slice(1, full ? 60 : 8).map((b) => (
          <Row key={b.id} b={b} />
        ))}
        {!data && <li className="label p-2">Loading guide…</li>}
      </ul>
    </div>
  );
}
