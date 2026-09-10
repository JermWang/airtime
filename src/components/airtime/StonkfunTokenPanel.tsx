"use client";

import { useStonkfunToken } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";
import type { StonkfunSnapshot } from "@/lib/stonkfun";

const number = (n: number | null | undefined, digits = 4) => n == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
const usd = (n: number | null | undefined, digits = 2) => n == null ? "—" : `$${number(n, digits)}`;
function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-4">
    <div className="label">{label}</div><div className="mt-2 break-words text-xl text-ink-50">{value}</div>
    {detail && <div className="mt-2 text-xs text-ink-400">{detail}</div>}
  </div>;
}

export function StonkfunTokenPanel() {
  const query = useStonkfunToken();
  const snapshot = query.data;
  const data = snapshot?.data;
  const state = query.error ? data ? "stale" : "unavailable" : snapshot?.status;
  const rewards = data?.rewards.rewards;
  const messages: Record<StonkfunSnapshot["status"], string> = {
    waiting_for_ca: "CA coming soon. Once AIRTIME’s mint is configured, its market data, rewards and platform burns will update here automatically from StonkFun.",
    invalid_ca: "The token address needs updating before StonkFun data can load.",
    unsupported_network: "StonkFun token tracking is available on Solana mainnet.",
    pending_listing: "Waiting for StonkFun to index this token. This page will check again automatically.",
    unavailable: "StonkFun data is temporarily unavailable. This page will retry automatically.",
    stale: "Showing the last available StonkFun figures. Updated data is temporarily unavailable.",
    live: "Figures reported by StonkFun · refreshes every minute.",
  };
  return <section className="mb-8 rounded-xl border border-white/10 p-4 sm:p-6" data-testid="stonkfun-token" aria-label="Token and StonkFun rewards">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl text-ink-50">Token and rewards</h2><p className="mt-2 text-sm text-ink-300" role="status">{query.isLoading ? "Loading StonkFun data…" : state ? messages[state] : messages.unavailable}</p></div>
      {snapshot?.tokenUrl && <a className="btn btn-sm" href={snapshot.tokenUrl} target="_blank" rel="noreferrer">View on StonkFun ↗</a>}
    </div>
    {data && <>
      <p className="mb-4 break-words text-sm text-ink-200">{data.token.name} · {data.token.symbol} / {data.token.quote.symbol} · {data.token.mode === "reward" ? "Reward Mode" : data.token.mode === "standard" ? "Standard Mode" : "Mode not reported"}</p>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Token price" value={usd(data.token.market.priceUsd, 10)} />
        <Metric label="Market cap" value={usd(data.token.market.marketCapUsd)} />
        <Metric label="24h volume" value={usd(data.token.market.volume24hUsd)} />
        <Metric label="24h change" value={data.token.market.priceChange24h == null ? "—" : `${number(data.token.market.priceChange24h, 2)}%`} />
      </div>
      <h3 className="mb-3 text-base text-ink-50">Holder rewards through StonkFun</h3>
      {data.token.mode === "standard" ? <p className="mb-5 text-sm text-ink-300">StonkFun identifies this as a Standard Mode token. Holder rewards are not enabled for this mode.</p> : !rewards ? <p className="mb-5 text-sm text-ink-300">Reward totals have not been reported yet.</p> : <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total rewards paid" value={`${number(rewards.distributedTokens, 8)} ${data.rewards.quote?.symbol ?? data.token.quote.symbol}`} detail="Paired reward-token units" />
        <Metric label="Awaiting distribution" value={`${number(rewards.undistributedTokens, 8)} ${data.rewards.quote?.symbol ?? data.token.quote.symbol}`} />
        <Metric label="Holders paid" value={number(rewards.holderCount, 0)} detail={`${number(rewards.payoutCount, 0)} holder payouts`} />
        <Metric label="Last payout" value={rewards.lastPayoutAt ? formatDateTime(rewards.lastPayoutAt) : "None reported"} />
      </div>}
      <p className="mb-5 text-xs leading-relaxed text-ink-400">StonkFun controls reward eligibility and distribution timing. {data.token.transferFee ? `Reported transfer fee: ${number(data.token.transferFee.bps / 100, 2)}%. ` : ""}Rewards are paid in the paired token; these amounts are not a count of directly owned company shares.</p>
      <h3 className="mb-3 text-base text-ink-50">Platform buybacks and burns</h3>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Tokens burned" value={`${number(data.burns.totals.amountTokens, 6)} ${data.token.symbol}`} detail={`${number(data.burns.totals.burnCount, 0)} burns reported`} />
        <Metric label="Value at burn time" value={usd(data.burns.totals.valueUsdAtBurn)} />
        <Metric label="Flywheel participation" value={data.token.flywheel?.active === true ? "Active" : data.token.flywheel?.active === false ? "Not active" : "Not reported"} detail="Current status reported by StonkFun" />
      </div>
      {data.burns.burns.length > 0 && <div className="overflow-x-auto"><table className="data min-w-[480px]"><thead><tr><th>Burned at</th><th>Tokens</th><th>Source</th><th>Transaction</th></tr></thead><tbody>{data.burns.burns.map(b => <tr key={b.signature}><td>{formatDateTime(b.burnedAt)}</td><td>{number(b.amountTokens, 6)}</td><td>{b.source ?? "StonkFun"}</td><td><a className="text-signal" href={`https://solscan.io/tx/${encodeURIComponent(b.signature)}`} target="_blank" rel="noreferrer">View on Solscan ↗</a></td></tr>)}</tbody></table></div>}
      <p className="mt-4 text-xs leading-relaxed text-ink-400">These are StonkFun-reported burns of this token. They are separate from AIRTIME’s advertising revenue and do not establish that ad-sale SOL funded a buyback.</p>
    </>}
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-400">
      {snapshot?.sourceUpdatedAt && <span>Source updated {formatDateTime(snapshot.sourceUpdatedAt)}</span>}
      <a className="text-signal" href="https://www.stonkfun.xyz/rewards" target="_blank" rel="noreferrer">StonkFun rewards ↗</a>
    </div>
  </section>;
}
