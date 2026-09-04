"use client";

import { useState } from "react";
import { useAdminSettings, useAdminMutation } from "@/components/control-room/adminApi";
import { Panel, Field } from "@/components/control-room/ui";
import { api } from "@/lib/api";
import { formatClock } from "@/lib/format";
import { useServerNow } from "@/lib/hooks";

export default function SettingsPage() {
  const { data } = useAdminSettings();
  const now = useServerNow(500);
  const patch = useAdminMutation((body: Record<string, unknown>) => api("/api/admin/settings", { method: "PATCH", json: body }));
  const [hold, setHold] = useState<number | null>(null);
  const [alloc, setAlloc] = useState<number | null>(null);
  const [holderCap, setHolderCap] = useState<number | null>(null);
  const [jump, setJump] = useState(5);
  const s = data?.settings;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Purchases">
        <div className="flex items-center justify-between">
          <div className="text-[12.5px] text-ink-200">Accepting new quotes</div>
          <button className={`btn btn-sm ${s?.purchasesPaused ? "btn-primary" : "btn-danger"}`} onClick={() => patch.mutate({ purchasesPaused: !s?.purchasesPaused })}>
            {s?.purchasesPaused ? "Resume" : "Pause"}
          </button>
        </div>
        <div className="mt-4">
          <Field label="Quote hold (seconds)" hint="How long a quote reserves inventory before it expires.">
            <div className="flex gap-2">
              <input className="field" type="number" value={hold ?? s?.quoteHoldSeconds ?? 180} onChange={(e) => setHold(Number(e.target.value))} />
              <button className="btn btn-sm" onClick={() => hold !== null && patch.mutate({ quoteHoldSeconds: hold })}>
                Save
              </button>
            </div>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Treasury allocation (%)" hint="Share of airtime revenue and token tax earmarked for Anduril pre-stock. Shown publicly on /treasury.">
            <div className="flex gap-2">
              <input
                className="field"
                type="number"
                min={0}
                max={100}
                step={1}
                value={alloc ?? (s ? s.treasuryAllocationBps / 100 : 100)}
                onChange={(e) => setAlloc(Number(e.target.value))}
              />
              <button className="btn btn-sm" onClick={() => alloc !== null && patch.mutate({ treasuryAllocationBps: Math.round(alloc * 100) })}>
                Save
              </button>
            </div>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Holder reward cap (% of pre-IPO)" hint="The most any single token holder is rewarded with. Stored as parts per million, so 0.005 is exact. Shown publicly on /treasury.">
            <div className="flex gap-2">
              <input
                className="field"
                type="number"
                min={0}
                max={100}
                step={0.001}
                value={holderCap ?? (s ? s.holderRewardCapPpm / 10_000 : 0.005)}
                onChange={(e) => setHolderCap(Number(e.target.value))}
              />
              <button className="btn btn-sm" onClick={() => holderCap !== null && patch.mutate({ holderRewardCapPpm: Math.round(holderCap * 10_000) })}>
                Save
              </button>
            </div>
          </Field>
        </div>
      </Panel>

      <Panel title="Simulation clock">
        {data?.simulationClockAllowed ? (
          <>
            <div className="mono text-[20px] tracking-tight text-ink-50" suppressHydrationWarning>
              {formatClock(now)} UTC
            </div>
            <div className="mono mt-1 text-[10.5px] text-ink-400">offset {((s?.clockOffsetMs ?? 0) / 1000).toFixed(0)}s</div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-300">Moves the whole station forward or back: playback offsets, quote expiry, activation and completion all follow the server clock. Every connected browser re-syncs automatically.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input className="field w-24" type="number" value={jump} onChange={(e) => setJump(Number(e.target.value))} />
              <span className="text-[11px] text-ink-300">minutes</span>
              <button className="btn btn-sm" onClick={() => patch.mutate({ clockOffsetMs: (s?.clockOffsetMs ?? 0) + jump * 60_000 })}>
                Jump forward
              </button>
              <button className="btn btn-sm" onClick={() => patch.mutate({ clockOffsetMs: (s?.clockOffsetMs ?? 0) - jump * 60_000 })}>
                Jump back
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => patch.mutate({ clockOffsetMs: 0 })}>
                Reset to real time
              </button>
            </div>
          </>
        ) : (
          <div className="text-[12px] text-ink-400">Disabled on this deployment. Set AIRTIME_ALLOW_SIM_CLOCK=true to enable it outside production.</div>
        )}
      </Panel>
    </div>
  );
}
