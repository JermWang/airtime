"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageFrame } from "@/components/hud/PageFrame";
import { Wordmark } from "@/components/hud/Wordmark";
import { api } from "@/lib/api";
import { formatDateTime, formatDurationSec, formatWei, shortHash, cn } from "@/lib/format";

interface AirLogDto {
  id: string;
  campaignId: string;
  displayName: string;
  placement: { id: string; name: string; type: string; kind: string; aspectRatio: string };
  channelId: string;
  creative: { type: string; url: string | null; posterUrl: string | null; textContent: string | null; creativeHash: string; contentHash: string } | null;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  wallet: string;
  walletFull: string;
  payment: { txHash: string; txUrl: string | null; blockNumber: string | null; amountWei: string | null; paymentToken: string | null; chainId: number; chainName: string } | null;
  playbackStatus: string;
  analytics: { sessionsPresent: number; uniqueSessionsApprox: number; creativeLoadSuccess: number; creativeLoadFailure: number; visibilitySamples: number; visibleSamples: number; videoCompletions: number; clicks: number };
  createdAt: string;
}

/** Shareable proof-of-air receipt. Payment facts come from the chain; delivery facts from the station. */
export default function AirLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: log, isLoading, error } = useQuery({ queryKey: ["airlog", id], queryFn: () => api<AirLogDto>(`/api/airlog/${id}`) });
  // What the buyer actually got: a run lasts until somebody outbids it, so the
  // real number is actual start → actual end, not anything scheduled.
  const guaranteedSec = log ? Math.round((new Date(log.scheduledEnd).getTime() - new Date(log.scheduledStart).getTime()) / 1000) : 0;
  const runtimeSec = log && log.actualStart && log.actualEnd ? Math.round((new Date(log.actualEnd).getTime() - new Date(log.actualStart).getTime()) / 1000) : null;
  const visibility = log && log.analytics.visibilitySamples > 0 ? Math.round((log.analytics.visibleSamples / log.analytics.visibilitySamples) * 100) : null;
  return (
    <PageFrame>
      {isLoading && <div className="label">Loading AirLog…</div>}
      {error && <div className="glass rounded-lg p-6 text-ink-200">AirLog not found. It is created when a campaign finishes airing.</div>}
      {log && (
        <article className="glass-strong specular mx-auto max-w-3xl rounded-2xl p-6 md:p-8" data-testid="airlog">
          <header className="mb-6 flex items-start justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <Wordmark size={14} />
              <div className="label mt-3">AirLog · proof of air</div>
              <h1 className="mt-1 text-[24px] font-medium tracking-tight text-ink-50">{log.displayName}</h1>
              <div className="mono mt-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-300">
                {log.placement.name} · channel {log.channelId}
              </div>
            </div>
            <span className={cn("chip", log.playbackStatus === "DELIVERED" ? "chip-signal" : log.playbackStatus === "FAILED" || log.playbackStatus === "MISSED" ? "chip-amber" : "")}>{log.playbackStatus}</span>
          </header>

          <div className="grid gap-6 md:grid-cols-[240px_1fr]">
            <div className="overflow-hidden rounded-md border border-white/10 bg-black" style={{ aspectRatio: log.placement.aspectRatio.replace(":", " / ") }}>
              {log.creative?.type === "TEXT" ? (
                <div className="mono flex h-full items-center justify-center px-3 text-center text-[11px] uppercase tracking-[0.12em] text-signal">{log.creative.textContent}</div>
              ) : log.creative?.posterUrl || log.creative?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={log.creative.posterUrl ?? log.creative.url ?? ""} alt="" className="h-full w-full object-contain" />
              ) : (
                <div className="label flex h-full items-center justify-center">no creative</div>
              )}
            </div>
            <dl className="mono grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[11px] text-ink-300">
              <dt>Where</dt>
              <dd className="text-ink-50">
                {log.placement.name} <span className="text-ink-500">({log.placement.type.toLowerCase()} · {log.placement.id})</span>
              </dd>
              <dt>Guaranteed</dt>
              <dd className="text-ink-50">
                {formatDurationSec(guaranteedSec)} <span className="text-ink-500">from {formatDateTime(log.scheduledStart)}, then until outbid</span>
              </dd>
              <dt>Actual run</dt>
              <dd className="text-ink-50">
                {log.actualStart ? `${formatDateTime(log.actualStart)} → ${log.actualEnd ? formatDateTime(log.actualEnd) : "still on air"}` : "never started"}
                {runtimeSec !== null && <span className="text-ink-500"> ({formatDurationSec(runtimeSec)})</span>}
              </dd>
              <dt>Buyer</dt>
              <dd className="break-all text-ink-50">{log.walletFull}</dd>
              <dt>Creative hash</dt>
              <dd className="break-all text-ink-50">{log.creative?.creativeHash ?? "—"}</dd>
            </dl>
          </div>

          <section className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-black/30 p-4">
              <div className="label mb-2">Payment · verified on chain</div>
              {log.payment ? (
                <dl className="mono grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[10.5px] text-ink-300">
                  <dt>Amount</dt>
                  <dd className="text-ink-50">{formatWei(log.payment.amountWei)}</dd>
                  <dt>Network</dt>
                  <dd className="text-ink-50">
                    {log.payment.chainName} ({log.payment.chainId})
                  </dd>
                  <dt>Transaction</dt>
                  <dd>
                    {log.payment.txUrl ? (
                      <a className="text-signal" href={log.payment.txUrl} target="_blank" rel="noreferrer">
                        {shortHash(log.payment.txHash)}
                      </a>
                    ) : (
                      <span className="break-all text-ink-50">{log.payment.txHash}</span>
                    )}
                  </dd>
                  <dt>Block</dt>
                  <dd className="text-ink-50">{log.payment.blockNumber}</dd>
                </dl>
              ) : (
                <div className="text-[11.5px] text-ink-400">No on-chain payment recorded.</div>
              )}
              <p className="mt-3 text-[10.5px] leading-relaxed text-ink-500">The blockchain proves that this quote — bound to this creative hash, placement and time window — was paid. It does not measure viewing.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-4">
              <div className="label mb-2">Delivery · first-party analytics</div>
              <dl className="mono grid grid-cols-[1fr_auto] gap-y-1 text-[10.5px] text-ink-300">
                <dt>Sessions present</dt>
                <dd className="text-ink-50">{log.analytics.sessionsPresent}</dd>
                <dt>Unique sessions (approx.)</dt>
                <dd className="text-ink-50">{log.analytics.uniqueSessionsApprox}</dd>
                <dt>Creative loads ok / failed</dt>
                <dd className="text-ink-50">
                  {log.analytics.creativeLoadSuccess} / {log.analytics.creativeLoadFailure}
                </dd>
                <dt>Tab visibility while airing</dt>
                <dd className="text-ink-50">{visibility === null ? "not measured" : `${visibility}%`}</dd>
                <dt>Video completions</dt>
                <dd className="text-ink-50">{log.analytics.videoCompletions}</dd>
                <dt>Clicks</dt>
                <dd className="text-ink-50">{log.analytics.clicks}</dd>
              </dl>
              <p className="mt-3 text-[10.5px] leading-relaxed text-ink-500">Recorded by the AIRTIME application from browsers that had the station open. These are application measurements, not on-chain facts and not cryptographically verified impressions.</p>
            </div>
          </section>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <div className="mono text-[9.5px] uppercase tracking-[0.14em] text-ink-500">
              AirLog {log.id} · issued {formatDateTime(log.createdAt)}
            </div>
            <div className="flex gap-2">
              <Link href={`/campaign/${log.campaignId}`} className="btn btn-sm">
                Campaign
              </Link>
              <Link href="/" className="btn btn-sm">
                Station
              </Link>
            </div>
          </footer>
        </article>
      )}
    </PageFrame>
  );
}
