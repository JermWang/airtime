"use client";

import Link from "next/link";
import { useAdminPayments } from "@/components/control-room/adminApi";
import { Panel, StatusChip } from "@/components/control-room/ui";
import { formatDateTime, formatWei, shortAddress, shortHash } from "@/lib/format";

export default function PaymentsPage() {
  const { data } = useAdminPayments();
  return (
    <Panel title="Payments · verified from chain events">
      <table className="data">
        <thead>
          <tr>
            <th>Confirmed</th>
            <th>Campaign</th>
            <th>Placement</th>
            <th>Buyer</th>
            <th>Amount</th>
            <th>Transaction</th>
            <th>Block</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data?.payments.map((p) => (
            <tr key={p.id}>
              <td className="mono text-[10.5px]">{formatDateTime(p.confirmedAt)}</td>
              <td>
                <Link href={`/campaign/${p.campaignId}`} className="text-ink-50 hover:text-signal">
                  {p.campaignName}
                </Link>
              </td>
              <td className="mono text-[10.5px]">{p.placementId}</td>
              <td className="mono text-[10.5px]" title={p.buyer}>
                {shortAddress(p.buyer)}
              </td>
              <td className="mono text-[10.5px] text-ink-50">{formatWei(p.amountWei)}</td>
              <td className="mono text-[10.5px]">
                {p.txUrl ? (
                  <a href={p.txUrl} target="_blank" rel="noreferrer" className="text-signal">
                    {shortHash(p.txHash)}
                  </a>
                ) : (
                  <span title={p.txHash}>{shortHash(p.txHash)}</span>
                )}
              </td>
              <td className="mono text-[10.5px]">{p.blockNumber}</td>
              <td>
                <StatusChip status={p.status} />
              </td>
            </tr>
          ))}
          {data && data.payments.length === 0 && (
            <tr>
              <td colSpan={8} className="text-ink-400">
                No payments yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}
