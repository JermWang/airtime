"use client";

import { useState } from "react";
import { useAdminCreatives, useAdminMutation } from "@/components/control-room/adminApi";
import { Panel, StatusChip } from "@/components/control-room/ui";
import { api } from "@/lib/api";
import { formatDateTime, shortAddress, cn } from "@/lib/format";

export default function ModerationPage() {
  const [status, setStatus] = useState("VALID");
  const { data } = useAdminCreatives(status);
  const decide = useAdminMutation((v: { id: string; decision: "APPROVED" | "REJECTED"; note?: string }) => api(`/api/admin/creatives/${v.id}`, { method: "PATCH", json: { decision: v.decision, note: v.note } }));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label">Creatives</span>
        {["VALID", "APPROVED", "REJECTED", "INVALID", "ALL"].map((s) => (
          <button key={s} className={cn("btn btn-sm", status === s && "bg-white/10")} onClick={() => setStatus(s)}>
            {s === "VALID" ? "Awaiting review" : s}
          </button>
        ))}
      </div>
      <Panel>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data?.creatives.map((c) => (
            <div key={c.id} className="rounded-md border border-white/10 bg-black/30 p-3">
              <div className="mb-2 aspect-video overflow-hidden rounded bg-black">
                {c.type === "TEXT" ? (
                  <div className="mono flex h-full items-center justify-center px-3 text-center text-[11px] uppercase tracking-[0.12em] text-signal">{c.textContent}</div>
                ) : c.type === "VIDEO" ? (
                  <video src={c.url ?? undefined} controls muted playsInline className="h-full w-full object-contain" />
                ) : c.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.url} alt="" className="h-full w-full object-contain" />
                ) : (
                  <div className="label flex h-full items-center justify-center">invalid upload</div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <StatusChip status={c.status} />
                <span className="mono text-[10px] text-ink-400">{formatDateTime(c.createdAt)}</span>
              </div>
              <div className="mono mt-1 text-[10px] text-ink-300">
                {c.type} · {c.placementId ?? "—"} · {shortAddress(c.wallet)}
                {c.width ? ` · ${c.width}×${c.height}` : ""}
                {c.durationSec ? ` · ${c.durationSec}s` : ""}
              </div>
              {c.validationErrors?.length > 0 && <ul className="mt-1 text-[10.5px] text-amber">{c.validationErrors.map((e) => <li key={e}>{e}</li>)}</ul>}
              {(c.status === "VALID" || c.status === "APPROVED" || c.status === "REJECTED") && (
                <div className="mt-2 flex gap-1">
                  <button className="btn btn-sm btn-primary flex-1" disabled={c.status === "APPROVED"} onClick={() => decide.mutate({ id: c.id, decision: "APPROVED" })}>
                    Approve
                  </button>
                  <button className="btn btn-sm btn-danger flex-1" disabled={c.status === "REJECTED"} onClick={() => decide.mutate({ id: c.id, decision: "REJECTED", note: "Does not meet station standards" })}>
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
          {data && data.creatives.length === 0 && <div className="text-[12px] text-ink-400">Nothing here.</div>}
        </div>
      </Panel>
    </div>
  );
}
