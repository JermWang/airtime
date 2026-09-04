"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel, Stat, Field } from "@/components/control-room/ui";
import { useAdminMutation } from "@/components/control-room/adminApi";
import { api, type TreasuryDto } from "@/lib/api";
import { formatWei, formatDateTime, shortHash, cn } from "@/lib/format";
import { parseEther } from "viem";

type Kind = "TAX_INFLOW" | "STOCK_PURCHASE" | "DISTRIBUTION";

const KIND_LABEL: Record<Kind, string> = {
  TAX_INFLOW: "Token tax received",
  STOCK_PURCHASE: "Bought Anduril pre-stock",
  DISTRIBUTION: "Distributed to holders",
};

/** Operator ledger: record what happened off-chain so the public page can show it. */
export default function TreasuryAdminPage() {
  const { data, refetch } = useQuery({ queryKey: ["admin", "treasury"], queryFn: () => api<TreasuryDto>("/api/admin/treasury"), refetchInterval: 15_000 });
  const [kind, setKind] = useState<Kind>("STOCK_PURCHASE");
  const [amount, setAmount] = useState("");
  const [shares, setShares] = useState("");
  const [holders, setHolders] = useState("");
  const [txHash, setTxHash] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const record = useAdminMutation(
    (body: Record<string, unknown>) => api("/api/admin/treasury", { method: "POST", json: body }),
    [["admin", "treasury"]],
  );
  const remove = useAdminMutation((id: string) => api(`/api/admin/treasury/${id}`, { method: "DELETE" }), [["admin", "treasury"]]);

  const s = data?.summary;

  const submit = async () => {
    setError(null);
    try {
      const body: Record<string, unknown> = { kind, note: note || null, reference: reference || null, txHash: txHash || null };
      if (occurredAt) body.occurredAt = new Date(occurredAt).toISOString();
      if (amount) body.amountWei = parseEther(amount as `${number}`).toString();
      if (shares) body.shares = shares;
      if (holders) body.holders = Number(holders);
      await record.mutateAsync(body);
      setAmount("");
      setShares("");
      setHolders("");
      setTxHash("");
      setReference("");
      setNote("");
      setOccurredAt("");
      await refetch();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Airtime revenue" value={s ? formatWei(s.airtimeRevenueWei) : "—"} />
        <Stat label="Token tax" value={s ? formatWei(s.taxInflowWei) : "—"} />
        <Stat label="Awaiting deployment" value={s ? formatWei(s.awaitingDeploymentWei) : "—"} tone="amber" />
        <Stat label="Pre-stock held" value={s ? `${s.sharesHeld}` : "—"} tone="signal" />
        <Stat label="Distributed" value={s ? `${s.sharesDistributed}` : "—"} />
      </div>

      <Panel title="Record an event">
        <p className="mb-3 max-w-2xl text-[11.5px] leading-relaxed text-ink-300">
          Airtime revenue is counted automatically from verified payments — do not enter it here. Record only what happens off this chain: token tax you received,
          pre-stock you bought through the broker, and distributions you made to holders. These appear publicly as operator-recorded figures.
        </p>
        <div className="mb-3 flex flex-wrap gap-1">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <button key={k} className={cn("btn btn-sm", kind === k && "bg-white/10 border-signal text-signal")} onClick={() => setKind(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {kind !== "DISTRIBUTION" && (
            <Field label={kind === "TAX_INFLOW" ? "Amount received (ETH)" : "Amount spent (ETH)"}>
              <input className="field" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          )}
          {kind !== "TAX_INFLOW" && (
            <Field label={kind === "STOCK_PURCHASE" ? "Shares acquired" : "Shares distributed"} hint={kind === "DISTRIBUTION" && s ? `${s.sharesHeld} held` : undefined}>
              <input className="field" inputMode="decimal" placeholder="0.000000" value={shares} onChange={(e) => setShares(e.target.value)} />
            </Field>
          )}
          {kind === "DISTRIBUTION" && (
            <Field label="Holders reached">
              <input className="field" inputMode="numeric" placeholder="0" value={holders} onChange={(e) => setHolders(e.target.value)} />
            </Field>
          )}
          <Field label="When" hint="defaults to now">
            <input className="field" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </Field>
          <Field label="Transaction hash" hint="optional, linked to the explorer">
            <input className="field" placeholder="0x…" value={txHash} onChange={(e) => setTxHash(e.target.value)} />
          </Field>
          <Field label="Reference" hint="broker order id, statement, …">
            <input className="field" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Note">
            <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        {error && <div className="mt-3 text-[11.5px] text-live">{error}</div>}
        <button className="btn btn-primary mt-3" disabled={record.isPending} onClick={() => void submit()}>
          {record.isPending ? "Recording…" : "Record entry"}
        </button>
      </Panel>

      <Panel title="Ledger">
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Event</th>
              <th>Amount</th>
              <th>Shares</th>
              <th>Holders</th>
              <th>Reference</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.ledger.map((r) => (
              <tr key={r.id}>
                <td className="mono whitespace-nowrap text-[10.5px]">{formatDateTime(r.occurredAt)}</td>
                <td className="text-[11.5px] text-ink-50">{KIND_LABEL[r.kind]}</td>
                <td className="mono text-[10.5px]">{BigInt(r.amountWei) > 0n ? formatWei(r.amountWei, 18, r.assetSymbol) : "—"}</td>
                <td className="mono text-[10.5px]">{Number(r.shares) > 0 ? r.shares : "—"}</td>
                <td className="mono text-[10.5px]">{r.holders ?? "—"}</td>
                <td className="mono text-[10.5px]">{r.txHash ? shortHash(r.txHash) : r.reference ?? "—"}</td>
                <td className="text-right">
                  <button className="btn btn-ghost btn-sm" onClick={() => remove.mutate(r.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {data && data.ledger.length === 0 && (
              <tr>
                <td colSpan={7} className="text-ink-400">
                  Nothing recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
