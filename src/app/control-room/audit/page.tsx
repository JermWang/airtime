"use client";

import { useAuditLog } from "@/components/control-room/adminApi";
import { Panel } from "@/components/control-room/ui";
import { formatDateTime } from "@/lib/format";

export default function AuditPage() {
  const { data } = useAuditLog();
  return (
    <Panel title="Audit log">
      <table className="data">
        <thead>
          <tr>
            <th>When</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {data?.logs.map((l) => (
            <tr key={l.id}>
              <td className="mono whitespace-nowrap text-[10.5px]">{formatDateTime(l.createdAt)}</td>
              <td className="mono text-[10.5px]">
                {l.actorType}
                {l.actorId ? ` · ${l.actorId.slice(0, 10)}` : ""}
              </td>
              <td className="mono text-[10.5px] text-ink-50">{l.action}</td>
              <td className="mono text-[10.5px]">{l.targetType ? `${l.targetType} ${l.targetId?.slice(0, 12)}` : "—"}</td>
              <td className="mono max-w-[420px] truncate text-[10px] text-ink-400" title={JSON.stringify(l.details)}>
                {JSON.stringify(l.details)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
