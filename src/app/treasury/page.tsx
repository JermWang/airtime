"use client";

import { PageFrame } from "@/components/hud/PageFrame";
import { useTreasury } from "@/lib/hooks";
import { formatWei, formatDateTime, shortHash, cn } from "@/lib/format";
import type { TreasuryLedgerRowDto } from "@/lib/api";

const KIND_LABEL: Record<TreasuryLedgerRowDto["kind"], string> = {
  TAX_INFLOW: "Token tax received",
  STOCK_PURCHASE: "Anduril pre-stock bought",
  DISTRIBUTION: "Distributed to holders",
};

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "signal" | "muted" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-4">
      <div className="label">{label}</div>
      <div className={cn("mono mt-1.5 text-[22px] leading-none tracking-tight", tone === "signal" ? "text-signal" : tone === "muted" ? "text-ink-300" : "text-ink-50")}>{value}</div>
      {sub && <div className="mono mt-1.5 text-[10px] uppercase tracking-[0.12em] text-ink-500">{sub}</div>}
    </div>
  );
}

/** Where the money goes: income in, Anduril pre-stock out. */
export default function TreasuryPage() {
  const { data, isLoading } = useTreasury();
  const s = data?.summary;
  const allocationPct = s ? (s.allocationBps / 100).toFixed(s.allocationBps % 100 === 0 ? 0 : 2) : "100";

  return (
    <PageFrame title="Treasury" wide>
      <p className="mb-5 max-w-3xl text-[13px] leading-relaxed text-ink-200">
        {allocationPct}% of what this network earns is used to buy Anduril pre-stock, which is then distributed to holders. Airtime revenue is counted automatically
        from payments the station verified on chain. Token tax, pre-stock purchases and distributions happen off this chain through a broker, so they are recorded by
        the station operator and shown here as recorded figures with a reference where one exists.
      </p>

      {isLoading && !s && <div className="label">Loading treasury…</div>}

      {s && (
        <>
          <section className="mb-4 grid gap-3 md:grid-cols-4">
            <Figure label="Airtime revenue" value={formatWei(s.airtimeRevenueWei)} sub={`${s.airtimePayments} verified payment${s.airtimePayments === 1 ? "" : "s"}`} />
            <Figure label="Token tax received" value={formatWei(s.taxInflowWei)} sub="operator recorded" />
            <Figure label="Total income" value={formatWei(s.totalInflowWei)} sub={`${allocationPct}% earmarked for pre-stock`} />
            <Figure label="Awaiting deployment" value={formatWei(s.awaitingDeploymentWei)} sub="earmarked, not yet spent" tone="muted" />
          </section>

          <section className="mb-6 grid gap-3 md:grid-cols-3">
            <Figure label="Spent on Anduril pre-stock" value={formatWei(s.deployedWei)} sub={`${s.purchases} purchase${s.purchases === 1 ? "" : "s"}`} tone="signal" />
            <Figure label="Pre-stock held" value={`${s.sharesHeld} sh`} sub={`${s.sharesAcquired} acquired · ${s.sharesDistributed} distributed`} tone="signal" />
            <Figure
              label="Distributed to holders"
              value={`${s.sharesDistributed} sh`}
              sub={s.distributions ? `${s.distributions} distribution${s.distributions === 1 ? "" : "s"} · ${s.holdersReached} holder payouts` : "none yet"}
            />
          </section>

          <section className="glass rounded-lg p-3">
            <div className="label mb-2">Ledger</div>
            {data!.ledger.length === 0 ? (
              <div className="rounded-md border border-dashed border-white/10 px-3 py-4 text-[12px] text-ink-400">
                Nothing recorded yet. Entries appear here as the operator records tax inflows, pre-stock purchases and distributions.
              </div>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Event</th>
                    <th>Amount</th>
                    <th>Shares</th>
                    <th>Holders</th>
                    <th>Reference</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.ledger.map((r) => (
                    <tr key={r.id}>
                      <td className="mono whitespace-nowrap text-[10.5px]">{formatDateTime(r.occurredAt)}</td>
                      <td>
                        <span className={cn("chip", r.kind === "STOCK_PURCHASE" ? "chip-signal" : r.kind === "DISTRIBUTION" ? "chip-amber" : "")}>{KIND_LABEL[r.kind]}</span>
                        {r.isDevData && <span className="chip ml-1">dev data</span>}
                      </td>
                      <td className="mono text-[10.5px] text-ink-50">{BigInt(r.amountWei) > 0n ? formatWei(r.amountWei, 18, r.assetSymbol) : "—"}</td>
                      <td className="mono text-[10.5px] text-ink-50">{Number(r.shares) > 0 ? `${r.shares} sh` : "—"}</td>
                      <td className="mono text-[10.5px]">{r.holders ?? "—"}</td>
                      <td className="mono text-[10.5px]">
                        {r.txUrl ? (
                          <a className="text-signal" href={r.txUrl} target="_blank" rel="noreferrer">
                            {shortHash(r.txHash)}
                          </a>
                        ) : r.txHash ? (
                          shortHash(r.txHash)
                        ) : (
                          r.reference ?? "—"
                        )}
                      </td>
                      <td className="text-[11.5px] text-ink-300">{r.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <p className="mt-5 max-w-3xl text-[11px] leading-relaxed text-ink-500">
            Airtime revenue is derived from payments whose on-chain event the station verified independently. Everything else on this page is a figure entered by the
            station operator: this site cannot prove a broker purchase or a distribution the way it can prove an airtime payment. Nothing here is an offer, a
            prospectus, or investment advice.
          </p>
        </>
      )}
    </PageFrame>
  );
}
