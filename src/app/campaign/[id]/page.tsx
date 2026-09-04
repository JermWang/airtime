"use client";

import { use } from "react";
import Link from "next/link";
import { PageFrame } from "@/components/hud/PageFrame";
import { useCampaign } from "@/lib/hooks";
import { formatDateTime, formatDurationSec, formatWei, shortHash, statusLabel, cn } from "@/lib/format";

const STEPS = ["DRAFT", "READY_TO_PURCHASE", "AWAITING_PAYMENT", "PAID", "QUEUED", "AIRING", "COMPLETED"];

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: c, isLoading, error } = useCampaign(id);
  const idx = c ? STEPS.indexOf(c.status) : -1;
  return (
    <PageFrame>
      {isLoading && <div className="label">Loading campaign…</div>}
      {error && <div className="glass rounded-lg p-6 text-ink-200">Campaign not found.</div>}
      {c && (
        <div className="grid gap-6 md:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-4">
            <div className="glass rounded-lg p-4">
              <div className="mb-1 flex items-center gap-3">
                <span className="label">Campaign</span>
                <span className={cn("chip", c.status === "AIRING" ? "chip-live" : ["QUEUED", "PAID", "COMPLETED"].includes(c.status) ? "chip-signal" : ["REJECTED", "CANCELLED", "REFUNDED"].includes(c.status) ? "chip-amber" : "")}>{statusLabel(c.status)}</span>
              </div>
              <h1 className="text-[22px] font-medium tracking-tight text-ink-50">{c.displayName}</h1>
              <div className="mono mt-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-300">
                {c.placement.name} · {c.durationSec ? formatDurationSec(c.durationSec) : "—"} · {c.startsAt ? formatDateTime(c.startsAt) : "no airtime reserved"}
              </div>
              {c.rejectionReason && <div className="mt-2 text-[11.5px] text-amber">{c.rejectionReason}</div>}
              <ol className="mt-4 flex flex-wrap items-center gap-1.5">
                {STEPS.map((s, i) => (
                  <li key={s} className="flex items-center gap-1.5">
                    <span className={cn("mono text-[9.5px] uppercase tracking-[0.14em]", i < idx ? "text-signal" : i === idx ? "text-ink-50" : "text-ink-600")}>{statusLabel(s)}</span>
                    {i < STEPS.length - 1 && <span className={cn("h-px w-3", i < idx ? "bg-signal" : "bg-white/10")} />}
                  </li>
                ))}
              </ol>
            </div>
            <div className="glass rounded-lg p-4">
              <div className="label mb-2">Creative</div>
              {c.creative ? (
                <div className="flex gap-4">
                  <div className="w-56 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black" style={{ aspectRatio: c.placement.aspectRatio.replace(":", " / ") }}>
                    {c.creative.type === "TEXT" ? (
                      <div className="mono flex h-full items-center justify-center px-3 text-center text-[11px] uppercase tracking-[0.12em] text-signal">{c.creative.textContent}</div>
                    ) : c.creative.type === "VIDEO" ? (
                      <video src={c.creative.url ?? undefined} muted controls playsInline className="h-full w-full object-contain" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.creative.url ?? ""} alt="" className={cn("h-full w-full", c.fit === "FILL" ? "object-cover" : "object-contain")} />
                    )}
                  </div>
                  <dl className="mono grid flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[10.5px] text-ink-300">
                    <dt>Type</dt>
                    <dd className="text-ink-100">{c.creative.type}</dd>
                    {c.creative.width && (
                      <>
                        <dt>Size</dt>
                        <dd className="text-ink-100">
                          {c.creative.width}×{c.creative.height}
                        </dd>
                      </>
                    )}
                    <dt>Framing</dt>
                    <dd className="text-ink-100">{c.fit}</dd>
                    <dt>Creative hash</dt>
                    <dd className="break-all text-ink-100" title="keccak256 of the stored bytes; signed into the quote and emitted on chain">
                      {c.creative.creativeHash}
                    </dd>
                    <dt>SHA-256</dt>
                    <dd className="break-all text-ink-100">{c.creative.contentHash}</dd>
                  </dl>
                </div>
              ) : (
                <div className="text-[12px] text-ink-400">No creative attached.</div>
              )}
            </div>
          </div>
          <aside className="flex flex-col gap-4">
            <div className="glass rounded-lg p-4">
              <div className="label mb-2">Payment</div>
              {c.payment ? (
                <dl className="mono grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10.5px] text-ink-300">
                  <dt>Amount</dt>
                  <dd className="text-ink-50">{formatWei(c.payment.amountWei)}</dd>
                  <dt>Status</dt>
                  <dd className="text-ink-100">{c.payment.status}</dd>
                  <dt>Transaction</dt>
                  <dd>
                    {c.payment.txUrl ? (
                      <a className="text-signal" href={c.payment.txUrl} target="_blank" rel="noreferrer">
                        {shortHash(c.payment.txHash)}
                      </a>
                    ) : (
                      <span className="text-ink-100">{shortHash(c.payment.txHash)}</span>
                    )}
                  </dd>
                  <dt>Block</dt>
                  <dd className="text-ink-100">{c.payment.blockNumber}</dd>
                  <dt>Confirmed</dt>
                  <dd className="text-ink-100">{formatDateTime(c.payment.confirmedAt)}</dd>
                  <dt>Chain</dt>
                  <dd className="text-ink-100">{c.payment.chainId}</dd>
                </dl>
              ) : (
                <div className="text-[12px] text-ink-400">Not paid yet.</div>
              )}
            </div>
            <div className="glass rounded-lg p-4">
              <div className="label mb-2">Buyer</div>
              <div className="mono break-all text-[10.5px] text-ink-100">{c.wallet}</div>
            </div>
            {c.airLogId && (
              <Link href={`/airlog/${c.airLogId}`} className="btn btn-primary">
                Open AirLog receipt
              </Link>
            )}
            <Link href="/" className="btn">
              Back to the station
            </Link>
          </aside>
        </div>
      )}
    </PageFrame>
  );
}
