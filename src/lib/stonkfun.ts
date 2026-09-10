export interface StonkfunData {
  token: {
    mint: string; name: string; symbol: string; mode: "reward" | "standard" | null;
    quote: { mint: string; symbol: string; name?: string };
    market: { priceUsd: number | null; marketCapUsd: number | null; volume24hUsd: number | null; priceChange24h: number | null };
    transferFee?: { bps: number };
    flywheel?: { active: boolean };
  };
  rewards: {
    quote?: { mint: string; symbol: string; decimals: number };
    rewards: { distributedTokens: number; undistributedTokens: number; payoutCount: number; holderCount: number; lastPayoutAt: string | null } | null;
  };
  burns: {
    totals: { amountTokens: number; valueUsdAtBurn: number; burnCount: number; lastBurnAt: string | null };
    burns: { signature: string; amountTokens: number; valueUsdAtBurn: number; source?: string; burnedAt: string }[];
  };
}

export interface StonkfunSnapshot {
  status: "waiting_for_ca" | "invalid_ca" | "unsupported_network" | "pending_listing" | "live" | "stale" | "unavailable";
  mint: string | null;
  tokenUrl: string | null;
  sourceUpdatedAt: string | null;
  checkedAt: string | null;
  data: StonkfunData | null;
}
