"use client";

import { useState } from "react";
import Link from "next/link";
import { useAdminCampaigns, useAdminMutation } from "@/components/control-room/adminApi";
import { Panel, StatusChip } from "@/components/control-room/ui";
import { api } from "@/lib/api";
import { formatDateTime, formatDurationSec, formatWei, shortAddress, shortHash, cn } from "@/lib/format";

const FILTERS = ["ACTIVE", "COMPLETED", "AWAITING_PAYMENT", "REFUNDED", "REJECTED", "CANCELLED", "ALL"];

export default function CampaignsPage() {
  const [status, setStatus] = useState("ACTIVE");
  const { data } = useAdminCampaigns(status);
  const setState = useAdminMutation((v: { id: string; status: "REJECTED" | "REFUNDED" | "CANCELLED"; reason?: string }) => api(`/api/admin/campaigns/${v.id}`, { method: "PATCH", json: { status: v.status, reason: v.reason } }));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label">Campaigns</span>
        {FILTERS.map((s) => (
          <button key={s} className={cn("btn btn-sm", status === s && "bg-white/10")} onClick={() => setStatus(s)}>
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      <Panel>
        <table className="data">
          <thead>
            <tr>
              <th>Status</th>
              <th>Campaign</th>
              <th>Placement</th>
              <th>Window</th>
              <th>Buyer</th>
              <th>Payment</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.campaigns.map((c) => (
              <tr key={c.id}>
                <td>
                  <StatusChip status={c.status} />
                </td>
                <td>
                  <Link href={`/campaign/${c.id}`} className="text-ink-50 hover:text-signal">
                    {c.displayName}
                  </Link>
                  {c.rejectionReason && <div className="text-[10px] text-amber">{c.rejectionReason}</div>}
                </td>
                <td className="mono text-[10.5px]">{c.placement.name}</td>
                <td className="mono text-[10.5px]">
                  {c.startsAt ? formatDateTime(c.startsAt) : "—"} {c.durationSec ? `· ${formatDurationSec(c.durationSec)}` : ""}
                </td>
                <td className="mono text-[10.5px]">{shortAddress(c.wallet)}</td>
                <td className="mono text-[10.5px]">
                  {c.payment ? (
                    <>
                      {formatWei(c.payment.amountWei)} ·{" "}
                      {c.payment.txUrl ? (
                        <a href={c.payment.txUrl} target="_blank" rel="noreferrer" className="text-signal">
                          {shortHash(c.payment.txHash)}
                        </a>
                      ) : (
                        shortHash(c.payment.txHash)
                      )}
                      {c.payment.status === "REFUNDED" && <span className="chip chip-amber ml-1">refunded</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="whitespace-nowrap text-right">
                  {["QUEUED", "AIRING", "PAID"].includes(c.status) && (
                    <button className="btn btn-sm btn-danger" onClick={() => setState.mutate({ id: c.id, status: "CANCELLED", reason: "Pulled by operator" })}>
                      Pull
                    </button>
                  )}
                  {c.payment && c.payment.status !== "REFUNDED" && ["COMPLETED", "CANCELLED", "REJECTED", "QUEUED", "PAID"].includes(c.status) && (
                    <button className="btn btn-sm ml-1" onClick={() => setState.mutate({ id: c.id, status: "REFUNDED", reason: "Refund issued off-chain by operator" })}>
                      Mark refunded
                    </button>
                  )}
                  {c.airLogId && (
                    <Link href={`/airlog/${c.airLogId}`} className="btn btn-sm btn-ghost ml-1">
                      AirLog
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {data && data.campaigns.length === 0 && (
              <tr>
                <td colSpan={7} className="text-ink-400">
                  No campaigns.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
