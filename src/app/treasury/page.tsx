"use client";

import { PageFrame } from "@/components/hud/PageFrame";
import { useTreasury } from "@/lib/hooks";
import { airtimeTokenDecimals } from "@/lib/chain/chains";
import { StonkfunTokenPanel } from "@/components/airtime/StonkfunTokenPanel";
import { formatWei, formatDateTime, shortHash, cn } from "@/lib/format";
import type { TreasuryLedgerRowDto } from "@/lib/api";

const KIND_LABEL: Record<TreasuryLedgerRowDto["kind"], string> = {
  TAX_INFLOW: "Token tax received",
  STOCK_PURCHASE: "Anduril pre-stock bought",
  DISTRIBUTION: "Distributed to holders",
  BUYBACK: "$AIRTIME bought back",
  BURN: "$AIRTIME burned",
};

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "signal" | "muted" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-4">
      <div className="label">{label}</div>
      <div className={cn("readout mt-1.5 text-[22px] leading-none tracking-tight", tone === "signal" ? "text-signal" : tone === "muted" ? "text-ink-300" : "text-ink-50")}>{value}</div>
      {sub && <div className="readout mt-1.5 text-[10px] uppercase tracking-[0.12em] text-ink-500">{sub}</div>}
    </div>
  );
}

/** Where the money goes: income in, Anduril pre-stock out. */
export default function TreasuryPage() {
  const { data, isLoading } = useTreasury();
  const s = data?.summary;

  return (
    <PageFrame title="Treasury" wide>
      <p className="mb-5 max-w-3xl text-[13px] leading-relaxed text-ink-200">
        AIRTIME advertising payments settle in SOL. Token market data, holder rewards and platform burns are reported by StonkFun for the published AIRTIME mint.
      </p>

      <StonkfunTokenPanel />

      {isLoading && !s && <div className="label">Loading treasury…</div>}

      {s && (
        <>
          <section className="mb-5 grid gap-3 sm:grid-cols-2">
            <Figure label="Airtime advertising revenue" value={formatWei(s.airtimeRevenueWei)} sub={`${s.airtimePayments} verified payment${s.airtimePayments === 1 ? "" : "s"}`} />
            <div className="rounded-lg border border-white/10 p-4 text-sm leading-relaxed text-ink-300">Advertising revenue is designated for AIRTIME buybacks and burns. The station records completed activity below with transaction references; StonkFun token rewards are tracked separately above.</div>
          </section>

          <section className="glass rounded-lg p-3">
            <div className="label mb-2">Station ledger · operator records</div>
            {data!.ledger.length === 0 ? (
              <div className="rounded-md border border-dashed border-white/10 px-3 py-4 text-[12px] text-ink-400">
                No station ledger entries yet. StonkFun reward totals and platform burns appear in the live token section above.
              </div>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Event</th>
                    <th>Amount</th>
                    <th>Shares</th>
                    <th>$AIRTIME</th>
                    <th>Holders</th>
                    <th>Reference</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.ledger.map((r) => (
                    <tr key={r.id}>
                      <td className="readout whitespace-nowrap text-[10.5px]">{formatDateTime(r.occurredAt)}</td>
                      <td>
                        <span className={cn("chip", r.kind === "STOCK_PURCHASE" || r.kind === "BUYBACK" ? "chip-signal" : r.kind === "DISTRIBUTION" || r.kind === "BURN" ? "chip-amber" : "")}>{KIND_LABEL[r.kind]}</span>
                        {r.isDevData && <span className="chip ml-1">dev data</span>}
                      </td>
                      <td className="readout text-[10.5px] text-ink-50">{BigInt(r.amountWei) > 0n ? formatWei(r.amountWei, 9, r.assetSymbol) : "—"}</td>
                      <td className="readout text-[10.5px] text-ink-50">{Number(r.shares) > 0 ? `${r.shares} sh` : "—"}</td>
                      <td className="readout text-[10.5px] text-ink-50">{BigInt(r.tokenAmountWei) > 0n ? formatWei(r.tokenAmountWei, airtimeTokenDecimals(), "AIRTIME") : "—"}</td>
                      <td className="readout text-[10.5px]">{r.holders ?? "—"}</td>
                      <td className="readout text-[10.5px]">
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
