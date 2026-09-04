"use client";

import Link from "next/link";
import { useOverview, useAdminCampaigns, useAdminMutation } from "@/components/control-room/adminApi";
import { Panel, Stat, StatusChip } from "@/components/control-room/ui";
import { api } from "@/lib/api";
import { formatClock, formatDateTime, formatDurationSec, formatWei, shortAddress } from "@/lib/format";
import { useServerNow } from "@/lib/hooks";

export default function MasterControlPage() {
  const { data } = useOverview();
  const { data: queue } = useAdminCampaigns("ACTIVE");
  const now = useServerNow(500);
  const pause = useAdminMutation((paused: boolean) => api("/api/admin/settings", { method: "PATCH", json: { purchasesPaused: paused } }));
  const endBlock = useAdminMutation((id: string) => api(`/api/admin/schedule/${id}`, { method: "POST" }));
  const setStatus = useAdminMutation((v: { id: string; status: "REJECTED" | "REFUNDED" | "CANCELLED"; reason?: string }) => api(`/api/admin/campaigns/${v.id}`, { method: "PATCH", json: { status: v.status, reason: v.reason } }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label">Master control</div>
          <div className="mono text-[22px] tracking-tight text-ink-50" suppressHydrationWarning>
            {formatClock(now)} UTC {data && data.simulatedOffsetMs !== 0 && <span className="chip chip-amber ml-2 align-middle">simulated clock</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data?.settings.purchasesPaused ? (
            <button className="btn btn-primary" onClick={() => pause.mutate(false)}>
              Resume purchases
            </button>
          ) : (
            <button className="btn btn-danger" onClick={() => pause.mutate(true)}>
              Pause purchases
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="On air" value={data?.counts.airing ?? "—"} tone="live" />
        <Stat label="Queued" value={data?.counts.queued ?? "—"} tone="signal" />
        <Stat label="Awaiting payment" value={data?.counts.awaiting ?? "—"} />
        <Stat label="Awaiting review" value={data?.counts.pendingModeration ?? "—"} tone={data?.counts.pendingModeration ? "amber" : undefined} />
        <Stat label="Completed" value={data?.counts.completed ?? "—"} />
        <Stat label="Revenue" value={data ? formatWei(data.revenue.totalWei) : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Now / Next">
          {data?.channels.map((ch) => (
            <div key={ch.channelId} className="mb-3 last:mb-0">
              <div className="mono mb-1 text-[10px] uppercase tracking-[0.14em] text-ink-400">{ch.channelId}</div>
              {ch.now ? (
                <div className="flex items-center justify-between rounded-md border border-white/10 bg-black/30 px-3 py-2">
                  <div>
                    <div className="text-[13px] text-ink-50">
                      {ch.now.title} {ch.now.isManual && <span className="chip chip-amber ml-1">manual</span>}
                    </div>
                    <div className="mono text-[10px] text-ink-400">
                      {ch.now.type} · {formatClock(ch.now.startsAt, false)}–{formatClock(ch.now.endsAt, false)} · {Math.floor(ch.offsetSec)}s in
                    </div>
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => endBlock.mutate(ch.now!.id)}>
                    End now
                  </button>
                </div>
              ) : (
                <div className="text-[12px] text-ink-400">Nothing scheduled — auto-fill will extend the timeline.</div>
              )}
              {ch.next && (
                <div className="mono mt-1 px-3 text-[10.5px] text-ink-300">
                  next · {ch.next.title} at {formatClock(ch.next.startsAt, false)}
                </div>
              )}
            </div>
          ))}
          <Link href="/control-room/schedule" className="btn btn-sm mt-2">
            Programming
          </Link>
        </Panel>

        <Panel title="Chain">
          {data && (
            <dl className="mono grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[10.5px] text-ink-300">
              <dt>Network</dt>
              <dd className="text-ink-50">
                {data.chain.name} ({data.chain.id})
              </dd>
              <dt>Payment contract</dt>
              <dd className="break-all text-ink-50">
                {data.chain.contract ? (
                  data.chain.contractUrl ? (
                    <a href={data.chain.contractUrl} target="_blank" rel="noreferrer" className="text-signal">
                      {data.chain.contract}
                    </a>
                  ) : (
                    data.chain.contract
                  )
                ) : (
                  <span className="text-amber">not configured — purchases disabled</span>
                )}
              </dd>
              <dt>Quote signer</dt>
              <dd className="break-all text-ink-50">{data.chain.quoteSigner}</dd>
              <dt>Purchases</dt>
              <dd>{data.settings.purchasesPaused ? <span className="text-amber">PAUSED</span> : <span className="text-signal">OPEN</span>}</dd>
            </dl>
          )}
        </Panel>
      </div>

      <Panel title="Ad queue" actions={<Link href="/control-room/campaigns" className="btn btn-sm">All campaigns</Link>}>
        <table className="data">
          <thead>
            <tr>
              <th>Status</th>
              <th>Campaign</th>
              <th>Placement</th>
              <th>Window</th>
              <th>Buyer</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {queue?.campaigns.map((c) => (
              <tr key={c.id}>
                <td>
                  <StatusChip status={c.status} />
                </td>
                <td className="text-ink-50">{c.displayName}</td>
                <td className="mono text-[10.5px]">{c.placement.name}</td>
                <td className="mono text-[10.5px]">
                  {c.startsAt ? formatDateTime(c.startsAt) : "—"} {c.durationSec ? `· ${formatDurationSec(c.durationSec)}` : ""}
                </td>
                <td className="mono text-[10.5px]">{shortAddress(c.wallet)}</td>
                <td className="text-right">
                  {["QUEUED", "AIRING", "PAID"].includes(c.status) && (
                    <button className="btn btn-sm btn-danger" onClick={() => setStatus.mutate({ id: c.id, status: "CANCELLED", reason: "Pulled by operator" })}>
                      Pull
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {queue && queue.campaigns.length === 0 && (
              <tr>
                <td colSpan={6} className="text-ink-400">
                  Queue is empty.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      {data && data.failedActivations.length > 0 && (
        <Panel title="Failed activations">
          <ul className="flex flex-col gap-1 text-[11.5px]">
            {data.failedActivations.map((f) => (
              <li key={f.id} className="flex justify-between rounded-md border border-amber/30 bg-amber/5 px-3 py-1.5">
                <span className="mono text-ink-100">
                  {f.placementId} · {formatDateTime(f.scheduledStart)}
                </span>
                <span className="text-amber">{f.failureReason ?? f.status}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
