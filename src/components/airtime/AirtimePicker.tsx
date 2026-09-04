"use client";

import { useMemo } from "react";
import { useAvailability, useServerNow } from "@/lib/hooks";
import type { PlacementDto, SlotDto } from "@/lib/api";
import { formatClock, formatRelative, cn } from "@/lib/format";

interface Props {
  placement: PlacementDto;
  durationSec: number;
  selected: string | null;
  onSelect: (slot: SlotDto) => void;
  hours?: number;
}

const STATUS_CLASS: Record<SlotDto["status"], string> = {
  AVAILABLE: "border-white/15 text-ink-100 hover:border-signal hover:text-signal",
  RESERVED: "border-amber/40 text-amber/80 cursor-not-allowed",
  SOLD_OUT: "border-white/5 text-ink-500 line-through cursor-not-allowed",
  UNAVAILABLE: "border-white/5 text-ink-600 cursor-not-allowed",
};

/** AVAILABLE / RESERVED / SOLD OUT grid of bookable windows. */
export function AirtimePicker({ placement, durationSec, selected, onSelect, hours = 24 }: Props) {
  const { data, isLoading } = useAvailability(placement.id, durationSec, hours);
  const now = useServerNow(1000);

  const groups = useMemo(() => {
    const map = new Map<string, SlotDto[]>();
    for (const s of data?.slots ?? []) {
      const key = placement.availability.inventoryMode === "AD_BREAK" ? `${s.blockId}` : new Date(s.startsAt).toISOString().slice(0, 13);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [data, placement.availability.inventoryMode]);

  const counts = useMemo(() => {
    const c = { AVAILABLE: 0, RESERVED: 0, SOLD_OUT: 0 };
    for (const s of data?.slots ?? []) if (s.status in c) c[s.status as keyof typeof c]++;
    return c;
  }, [data]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="label">Next {hours}h</span>
        <span className="mono text-[10px] text-ink-300">
          <span className="text-signal">{counts.AVAILABLE}</span> available · <span className="text-amber">{counts.RESERVED}</span> reserved · <span className="text-ink-500">{counts.SOLD_OUT}</span> sold
        </span>
      </div>
      <div className="scrollbar-thin max-h-[220px] overflow-y-auto pr-1" data-testid="airtime-slots">
        {isLoading && <div className="label py-3">Checking inventory…</div>}
        {!isLoading && groups.length === 0 && <div className="rounded-md border border-dashed border-white/10 px-3 py-3 text-[11.5px] text-ink-400">No windows in range. Try a different duration.</div>}
        {groups.map(([key, slots]) => {
          const first = slots[0];
          const head = placement.availability.inventoryMode === "AD_BREAK" ? `${first.blockTitle ?? "Commercial break"} · ${formatClock(first.startsAt, false)}${first.context ? ` · ${first.context.toLowerCase()}` : ""}` : `${formatClock(first.startsAt, false).slice(0, 2)}:00 UTC`;
          return (
            <div key={key} className="mb-2">
              <div className="mono mb-1 text-[10px] uppercase tracking-[0.12em] text-ink-400">{head}</div>
              <div className="flex flex-wrap gap-1">
                {slots.map((s) => {
                  const isSel = selected === s.startsAt;
                  return (
                    <button
                      key={s.startsAt}
                      disabled={s.status !== "AVAILABLE"}
                      onClick={() => onSelect(s)}
                      title={`${formatClock(s.startsAt)} – ${formatClock(s.endsAt)} UTC · ${s.status.replace("_", " ")} · ${formatRelative(s.startsAt, now)}`}
                      className={cn("mono rounded border px-2 py-1 text-[10.5px] tracking-[0.06em] transition", STATUS_CLASS[s.status], isSel && "border-signal bg-signal-soft text-signal")}
                      data-status={s.status}
                    >
                      {formatClock(s.startsAt, placement.availability.slotSeconds < 60)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
