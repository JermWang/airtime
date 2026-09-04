"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { AnimatePresence, motion } from "motion/react";
import { api, type CampaignDto, type CreativeDto, type PlacementDto, type QuoteDto, type SlotDto } from "@/lib/api";
import { useServerNow } from "@/lib/hooks";
import { useStation } from "@/lib/store";
import { formatWei, formatDurationSec, formatClock, formatDateTime, cn, shortHash } from "@/lib/format";
import { CreativeUpload } from "./CreativeUpload";
import { AirtimePicker } from "./AirtimePicker";
import { useWalletAuth } from "./useWalletAuth";
import { usePurchase } from "./usePurchase";
import { WalletButton } from "@/components/hud/WalletButton";
import { placementKindCache } from "@/components/station/Overlays";

type Step = "connect" | "creative" | "airtime" | "quote" | "done";

interface Props {
  placement: PlacementDto;
  onClose?: () => void;
  /** Called when the campaign is confirmed (e.g. to focus the queue). */
  onConfirmed?: (c: CampaignDto) => void;
  compact?: boolean;
}

/**
 * The pay-to-broadcast mechanic, start to finish:
 * connect → creative → preview (live) → duration → airtime → quote → pay → queue.
 */
export function PurchaseFlow({ placement, onClose, onConfirmed, compact }: Props) {
  const { isConnected } = useAccount();
  const auth = useWalletAuth();
  const purchase = usePurchase();
  const now = useServerNow(500);
  const setPreview = useStation((s) => s.setPreview);
  const setShowSafeZones = useStation((s) => s.setShowSafeZones);

  const [creative, setCreative] = useState<CreativeDto | null>(null);
  const [campaign, setCampaign] = useState<CampaignDto | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [fit, setFit] = useState<"FIT" | "FILL">(placement.material.fit);
  const [durationSec, setDurationSec] = useState<number>(placement.durationOptionsSec[0] ?? placement.minDurationSec);
  const [slot, setSlot] = useState<SlotDto | null>(null);
  const [quote, setQuote] = useState<QuoteDto | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  placementKindCache.set(placement.id, placement.kind);

  const ready = isConnected && auth.signedIn && !auth.wrongChain;
  const step: Step = useMemo(() => {
    if (campaign && ["PAID", "QUEUED", "AIRING", "COMPLETED"].includes(campaign.status)) return "done";
    if (!ready) return "connect";
    if (!creative || !campaign) return "creative";
    if (!quote) return "airtime";
    return "quote";
  }, [ready, creative, campaign, quote]);

  // Live WYSIWYG preview on the real surface.
  useEffect(() => {
    if (!creative) {
      setPreview(null);
      return;
    }
    setPreview(creative.type === "TEXT" ? { kind: "text", text: creative.textContent ?? "", fit } : { kind: creative.type === "VIDEO" ? "video" : "image", url: creative.url ?? undefined, fit });
    return () => setPreview(null);
  }, [creative, fit, setPreview]);

  useEffect(() => {
    setShowSafeZones(step === "creative" && Boolean(creative));
    return () => setShowSafeZones(false);
  }, [step, creative, setShowSafeZones]);

  const quoteSecondsLeft = quote ? Math.max(0, Math.floor((new Date(quote.expiresAt).getTime() - now) / 1000)) : 0;
  useEffect(() => {
    if (quote && quoteSecondsLeft === 0 && purchase.state.phase === "idle") {
      setQuote(null);
      setError("Quote expired – the hold on this airtime was released. Request a new quote.");
    }
  }, [quote, quoteSecondsLeft, purchase.state.phase]);

  const onCreative = useCallback(
    async (c: CreativeDto) => {
      setCreative(c);
      setError(null);
      try {
        if (campaign) {
          const updated = await api<CampaignDto>(`/api/campaigns/${campaign.id}`, { method: "PATCH", json: { creativeId: c.id, fit } });
          setCampaign(updated);
        } else {
          const created = await api<CampaignDto>("/api/campaigns", { method: "POST", json: { placementId: placement.id, displayName: displayName || "Untitled campaign", creativeId: c.id, fit } });
          setCampaign(created);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [campaign, placement.id, displayName, fit],
  );

  const requestQuote = useCallback(async () => {
    if (!campaign || !slot) return;
    setQuoting(true);
    setError(null);
    try {
      if (displayName && displayName !== campaign.displayName) {
        await api(`/api/campaigns/${campaign.id}`, { method: "PATCH", json: { displayName, fit } });
      }
      const q = await api<QuoteDto>(`/api/campaigns/${campaign.id}/quote`, { method: "POST", json: { startsAt: slot.startsAt, durationSec } });
      setQuote(q);
      purchase.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setQuoting(false);
    }
  }, [campaign, slot, durationSec, displayName, fit, purchase]);

  const pay = useCallback(async () => {
    if (!quote) return;
    setError(null);
    const result = await purchase.pay(quote);
    if (result) {
      setCampaign(result);
      if (["PAID", "QUEUED", "AIRING"].includes(result.status)) onConfirmed?.(result);
    }
  }, [quote, purchase, onConfirmed]);

  // Poll the campaign while the chain watcher may confirm independently of this tab.
  useEffect(() => {
    if (!campaign || step !== "quote" || purchase.state.phase !== "confirming") return;
    const t = setInterval(async () => {
      try {
        const c = await api<CampaignDto>(`/api/campaigns/${campaign.id}`);
        if (["PAID", "QUEUED", "AIRING", "COMPLETED"].includes(c.status)) {
          setCampaign(c);
          onConfirmed?.(c);
        }
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [campaign, step, purchase.state.phase, onConfirmed]);

  const Stepper = () => {
    const steps: Array<[Step, string]> = [
      ["connect", "Wallet"],
      ["creative", "Creative"],
      ["airtime", "Airtime"],
      ["quote", "Pay"],
      ["done", "On queue"],
    ];
    const idx = steps.findIndex(([s]) => s === step);
    return (
      <ol className="mb-3 flex items-center gap-1.5" aria-label="Purchase steps">
        {steps.map(([s, label], i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cn("mono text-[9.5px] uppercase tracking-[0.16em]", i < idx ? "text-signal" : i === idx ? "text-ink-50" : "text-ink-500")}>{label}</span>
            {i < steps.length - 1 && <span className={cn("h-px w-3", i < idx ? "bg-signal" : "bg-white/15")} />}
          </li>
        ))}
      </ol>
    );
  };

  return (
    <div className="flex flex-col" data-testid="purchase-flow" data-step={step}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="label mb-1">{placement.type === "ENVIRONMENT" ? "Studio surface" : placement.type === "FULLSCREEN" ? "Main broadcast" : placement.type}</div>
          <div className="text-[15px] font-medium tracking-tight text-ink-50">{placement.name}</div>
          {!compact && placement.description && <div className="mt-1 text-[11.5px] leading-relaxed text-ink-300">{placement.description}</div>}
        </div>
        {onClose && (
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
      </div>
      <Stepper />

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {step === "connect" && (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] leading-relaxed text-ink-200">Connect a wallet to buy this surface. Payment settles on Robinhood Chain; the creative you upload is hashed into the quote so exactly what you approve is what airs.</p>
              {!isConnected ? (
                <WalletButton prominent className="self-start" />
              ) : auth.wrongChain ? (
                <button className="btn btn-primary self-start" onClick={() => void auth.ensureChain()} disabled={auth.switching} data-testid="switch-chain">
                  {auth.switching ? "Switching…" : `Switch to ${auth.targetChain.name}`}
                </button>
              ) : (
                <button className="btn btn-primary self-start" onClick={() => void auth.signIn()} disabled={auth.signing} data-testid="sign-in">
                  {auth.signing ? "Check your wallet…" : "Sign in with wallet"}
                </button>
              )}
              {auth.error && <div className="text-[11px] text-live">{auth.error}</div>}
            </div>
          )}

          {step === "creative" && (
            <div className="flex flex-col gap-3">
              <input className="field" placeholder="Brand or campaign name (shown in the public broadcast log)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} data-testid="display-name" />
              <CreativeUpload placement={placement} onCreative={onCreative} current={creative} />
              {creative && creative.type !== "TEXT" && placement.type !== "OVERLAY" && (
                <div className="flex items-center gap-2">
                  <span className="label">Framing</span>
                  {(["FIT", "FILL"] as const).map((f) => (
                    <button key={f} className={cn("btn btn-sm", fit === f && "bg-white/10")} onClick={() => setFit(f)}>
                      {f}
                    </button>
                  ))}
                  <span className="text-[10.5px] text-ink-400">Preview updates on the surface.</span>
                </div>
              )}
              {creative && campaign && (
                <div className="rounded-md border border-signal/40 bg-signal-soft px-3 py-2 text-[11.5px] text-signal" data-testid="creative-ready">
                  Creative validated · previewing on the surface. Choose airtime next.
                </div>
              )}
            </div>
          )}

          {(step === "airtime" || step === "quote") && creative && campaign && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/30 p-2">
                <div className="h-9 w-16 shrink-0 overflow-hidden rounded-sm bg-black">
                  {creative.type === "TEXT" ? (
                    <div className="mono flex h-full items-center justify-center text-[9px] text-signal">TXT</div>
                  ) : creative.type === "VIDEO" ? (
                    <video src={creative.url ?? undefined} muted playsInline className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={creative.posterUrl ?? creative.url ?? ""} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1 text-[11px]">
                  <div className="truncate text-ink-100">{creative.type === "TEXT" ? creative.textContent : `${creative.type} · ${creative.width}×${creative.height}`}</div>
                  <div className="mono truncate text-[9.5px] text-ink-500" title={creative.creativeHash}>
                    hash {shortHash(creative.creativeHash)}
                  </div>
                </div>
                {step === "airtime" && (
                  <button className="btn btn-ghost btn-sm" onClick={() => { setCreative(null); setQuote(null); }}>
                    Change
                  </button>
                )}
              </div>

              {step === "airtime" && (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="label mr-1">Duration</span>
                    {(placement.durationOptionsSec.length ? placement.durationOptionsSec : [placement.minDurationSec]).map((d) => (
                      <button key={d} className={cn("btn btn-sm", durationSec === d && "border-signal text-signal")} onClick={() => { setDurationSec(d); setSlot(null); }} data-testid={`duration-${d}`}>
                        {formatDurationSec(d)}
                      </button>
                    ))}
                  </div>
                  <AirtimePicker placement={placement} durationSec={durationSec} selected={slot?.startsAt ?? null} onSelect={setSlot} hours={Math.min(24, placement.availability.horizonHours)} />
                  <button className="btn btn-primary" disabled={!slot || quoting} onClick={() => void requestQuote()} data-testid="get-quote">
                    {quoting ? "Pricing…" : slot ? `Get quote · ${formatClock(slot.startsAt, false)} UTC · ${formatDurationSec(durationSec)}` : "Select airtime"}
                  </button>
                </>
              )}

              {step === "quote" && quote && (
                <div className="flex flex-col gap-3" data-testid="quote">
                  <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="flex items-baseline justify-between">
                      <span className="label">Total</span>
                      <span className="mono text-[20px] tracking-tight text-ink-50" data-testid="quote-amount">
                        {formatWei(quote.amountWei)}
                      </span>
                    </div>
                    <div className="mono mt-1 text-[10px] uppercase tracking-[0.12em] text-ink-400">
                      {formatDateTime(quote.startsAt)} · {formatDurationSec(durationSec)}
                    </div>
                    <details className="mt-2">
                      <summary className="label cursor-pointer">Price breakdown</summary>
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {quote.breakdown.map((l, i) => (
                          <li key={i} className="mono flex justify-between text-[10.5px] text-ink-300">
                            <span>
                              {l.label}
                              {l.multiplierBps ? ` ×${(l.multiplierBps / 10000).toFixed(2)}` : ""}
                            </span>
                            <span>{formatWei(l.amountWei)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="mono text-[10px] text-ink-400">Inventory held for</span>
                      <span className={cn("mono text-[11px]", quoteSecondsLeft < 30 ? "text-live" : "text-ink-100")} suppressHydrationWarning>
                        {Math.floor(quoteSecondsLeft / 60)}:{String(quoteSecondsLeft % 60).padStart(2, "0")}
                      </span>
                    </div>
                  </div>

                  {purchase.state.phase === "idle" || purchase.state.phase === "error" ? (
                    <div className="flex gap-2">
                      <button className="btn btn-ghost" onClick={() => { setQuote(null); purchase.reset(); }}>
                        Back
                      </button>
                      <button className="btn btn-primary flex-1" onClick={() => void pay()} data-testid="pay">
                        Pay {formatWei(quote.amountWei)} on Robinhood Chain
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-md border border-white/10 px-3 py-2 text-[11.5px]" data-testid="payment-status" data-phase={purchase.state.phase}>
                      <div className="flex items-center gap-2">
                        <span className={cn("h-1.5 w-1.5 rounded-full", purchase.state.phase === "confirmed" ? "bg-signal" : "bg-amber animate-pulse")} />
                        <span className="text-ink-100">
                          {purchase.state.phase === "wallet" && "Confirm in your wallet…"}
                          {purchase.state.phase === "pending" && "Transaction submitted · waiting for the block…"}
                          {purchase.state.phase === "verifying" && "Mined · station is verifying the on-chain event…"}
                          {purchase.state.phase === "confirming" && `Waiting for confirmation (${purchase.state.outcome})`}
                          {purchase.state.phase === "confirmed" && "Payment verified · campaign queued"}
                        </span>
                      </div>
                      {purchase.state.txHash && <div className="mono mt-1 text-[10px] text-ink-400">tx {shortHash(purchase.state.txHash)}</div>}
                    </div>
                  )}
                  {purchase.state.error && <div className="text-[11.5px] text-[#ff8a83]" data-testid="payment-error">{purchase.state.error}</div>}
                </div>
              )}
            </div>
          )}

          {step === "done" && campaign && (
            <div className="flex flex-col gap-3" data-testid="purchase-done">
              <div className="rounded-lg border border-signal/40 bg-signal-soft p-3">
                <div className="label-strong text-signal">{campaign.status === "AIRING" ? "On air now" : campaign.status === "COMPLETED" ? "Aired" : "Queued"}</div>
                <div className="mt-1 text-[13px] text-ink-50">{campaign.displayName}</div>
                <div className="mono mt-1 text-[10px] uppercase tracking-[0.12em] text-ink-300">
                  {placement.name} · {campaign.startsAt ? formatDateTime(campaign.startsAt) : ""} · {campaign.durationSec ? formatDurationSec(campaign.durationSec) : ""}
                </div>
                {campaign.payment && (
                  <div className="mono mt-2 text-[10px] text-ink-400">
                    paid {formatWei(campaign.payment.amountWei)} ·{" "}
                    {campaign.payment.txUrl ? (
                      <a href={campaign.payment.txUrl} target="_blank" rel="noreferrer" className="text-signal">
                        {shortHash(campaign.payment.txHash)}
                      </a>
                    ) : (
                      shortHash(campaign.payment.txHash)
                    )}{" "}
                    · block {campaign.payment.blockNumber}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Link href={`/campaign/${campaign.id}`} className="btn flex-1" data-testid="campaign-link">
                  Campaign receipt
                </Link>
                {onClose && (
                  <button className="btn btn-primary flex-1" onClick={onClose}>
                    Watch the station
                  </button>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {error && (
        <div className="mt-3 rounded-md border border-live/40 bg-live/10 px-3 py-2 text-[11.5px] text-[#ff8a83]" data-testid="flow-error">
          {error}
        </div>
      )}
    </div>
  );
}
