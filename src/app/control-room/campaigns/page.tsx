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
  const [refundHashes, setRefundHashes] = useState<Record<string, string>>({});
  // The name on a run is what the public broadcast log shows, so an operator
  // can correct one here without touching its payment or the surface it holds.
  const [renaming, setRenaming] = useState<Record<string, string>>({});
  const stopRenaming = (id: string) =>
    setRenaming((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  const { data } = useAdminCampaigns(status);
  const setState = useAdminMutation((v: { id: string; status: "REJECTED" | "REFUNDED" | "CANCELLED"; reason?: string; refundTxHash?: string }) => api(`/api/admin/campaigns/${v.id}`, { method: "PATCH", json: v }));
  const rename = useAdminMutation((v: { id: string; displayName: string }) => api(`/api/admin/campaigns/${v.id}`, { method: "PATCH", json: { displayName: v.displayName } }));
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
                  {renaming[c.id] === undefined ? (
                    <div className="flex items-center gap-2">
                      <Link href={`/campaign/${c.id}`} className="text-ink-50 hover:text-signal">
                        {c.displayName}
                      </Link>
                      <button className="btn btn-sm" onClick={() => setRenaming((r) => ({ ...r, [c.id]: c.displayName }))}>
                        Rename
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        className="field w-48"
                        autoFocus
                        value={renaming[c.id]}
                        onChange={(e) => setRenaming((r) => ({ ...r, [c.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") stopRenaming(c.id);
                        }}
                      />
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={rename.isPending || !renaming[c.id].trim()}
                        onClick={async () => {
                          await rename.mutateAsync({ id: c.id, displayName: renaming[c.id].trim() });
                          stopRenaming(c.id);
                        }}
                      >
                        Save
                      </button>
                      <button className="btn btn-sm" onClick={() => stopRenaming(c.id)}>
                        Cancel
                      </button>
                    </div>
                  )}
                  {c.rejectionReason && <div className="text-[10px] text-amber">{c.rejectionReason}</div>}
                </td>
                <td className="readout text-[10.5px]">{c.placement.name}</td>
                <td className="readout text-[10.5px]">
                  {c.startsAt ? formatDateTime(c.startsAt) : "—"} {c.durationSec ? `· ${formatDurationSec(c.durationSec)}` : ""}
                </td>
                <td className="readout text-[10.5px]">{shortAddress(c.wallet)}</td>
                <td className="readout text-[10.5px]">
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
                      {c.payment.status === "REFUNDED" && (
                        <span className="ml-1">
                          <span className="chip chip-amber">refunded</span>{" "}
                          {c.payment.refundTxUrl ? (
                            <a href={c.payment.refundTxUrl} target="_blank" rel="noreferrer" className="text-signal" title="Verified refund transaction">
                              {shortHash(c.payment.refundTxHash ?? "")}
                            </a>
                          ) : c.payment.refundTxHash ? (
                            shortHash(c.payment.refundTxHash)
                          ) : null}
                        </span>
                      )}
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
                    <span className="ml-1 inline-flex items-center gap-1">
                      <input
                        className="field readout w-44 text-[10px]"
                        aria-label={`Refund transaction for ${c.displayName}`}
                        placeholder="Refund tx hash"
                        value={refundHashes[c.id] ?? ""}
                        onChange={(event) => setRefundHashes((current) => ({ ...current, [c.id]: event.target.value.trim() }))}
                      />
                      <button
                        className="btn btn-sm"
                        disabled={setState.isPending || !/^0x[0-9a-fA-F]{64}$/.test(refundHashes[c.id] ?? "")}
                        onClick={() => setState.mutate({ id: c.id, status: "REFUNDED", reason: "Verified treasury refund", refundTxHash: refundHashes[c.id] })}
                      >
                        Verify refund
                      </button>
                    </span>
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
