import { z } from "zod";
import { activeChainEnv } from "@/lib/chain/chains";
import { isSolanaAddress, isSolanaSignature } from "@/lib/chain/solana";
import type { StonkfunData, StonkfunSnapshot } from "@/lib/stonkfun";

const BASE = "https://www.stonkfun.xyz/api/public/v1";
const TTL = 60_000;
const amount = z.number().finite().nonnegative();
const date = z.string().datetime({ offset: true });
const mintSchema = z.string().refine(isSolanaAddress);
const quote = z.object({ mint: mintSchema, symbol: z.string().max(80), name: z.string().max(200).optional() });
const mode = z.enum(["reward", "standard"]);
const tokenSchema = z.object({
  network: z.literal("mainnet-beta"),
  token: z.object({
    mint: mintSchema, name: z.string().max(200), symbol: z.string().max(80), mode: mode.nullable(), quote,
    market: z.object({ priceUsd: amount.nullable(), marketCapUsd: amount.nullable(), volume24hUsd: amount.nullable(), priceChange24h: z.number().finite().nullable() }),
    transferFee: z.object({ bps: z.number().int().min(0).max(10000) }).optional(),
    flywheel: z.object({ active: z.boolean() }).optional(),
  }),
});
const rewardsSchema = z.object({
  mint: mintSchema, mode,
  quote: quote.extend({ decimals: z.number().int().min(0).max(18) }).optional(),
  rewards: z.object({ distributedTokens: amount, undistributedTokens: amount, payoutCount: amount.int(), holderCount: amount.int(), lastPayoutAt: date.nullable() }).nullable(),
});
const burnsSchema = z.object({
  mint: mintSchema,
  totals: z.object({ amountTokens: amount, valueUsdAtBurn: amount, burnCount: amount.int(), lastBurnAt: date.nullable() }),
  burns: z.array(z.object({ signature: z.string().refine(isSolanaSignature), amountTokens: amount, valueUsdAtBurn: amount, source: z.string().max(80).optional(), burnedAt: date })).max(25),
});

class UpstreamError extends Error {
  constructor(public status: number, public retryMs = TTL) { super("StonkFun data unavailable"); }
}

async function read<T extends z.ZodType>(path: string, schema: T): Promise<{ data: z.infer<T>; updatedAt: string }> {
  const response = await fetch(`${BASE}${path}`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(6000) });
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? (Date.parse(retry) - Date.now()) / 1000 : 60;
    throw new UpstreamError(response.status, Number.isFinite(seconds) ? Math.max(TTL, seconds * 1000) : TTL);
  }
  const text = await response.text();
  if (text.length > 500_000) throw new Error("Unexpected StonkFun response size");
  const envelope = z.object({ data: z.unknown(), meta: z.object({ generatedAt: date }) }).parse(JSON.parse(text));
  return { data: schema.parse(envelope.data), updatedAt: envelope.meta.generatedAt };
}

/** Read-only, mint-bound feed. No launches, wallet signatures, swaps or distributions. */
export function createStonkfunReader() {
  let key: string | null = null;
  let cached: StonkfunSnapshot | null = null;
  let retryAt = 0;
  let pending: Promise<StonkfunSnapshot> | null = null;
  return async (mint: string): Promise<StonkfunSnapshot> => {
    if (key !== mint) { key = mint; cached = null; retryAt = 0; pending = null; }
    const empty: StonkfunSnapshot = { mint, tokenUrl: `https://www.stonkfun.xyz/token/${encodeURIComponent(mint)}`, status: "unavailable", sourceUpdatedAt: null, checkedAt: null, data: null };
    if (!isSolanaAddress(mint)) return { ...empty, mint: null, tokenUrl: null, status: "invalid_ca" };
    if (cached && Date.now() < retryAt) return cached;
    if (pending) return pending;
    const request = (async () => {
      const previous = cached;
      let next: StonkfunSnapshot;
      let delay = TTL;
      let found = false;
      try {
        const token = await read(`/tokens/${mint}`, tokenSchema);
        if (token.data.token.mint !== mint) throw new Error("Token mismatch");
        found = true;
        const results = await Promise.allSettled([read(`/tokens/${mint}/rewards`, rewardsSchema), read(`/tokens/${mint}/burns?limit=10`, burnsSchema)]);
        for (const result of results) if (result.status === "rejected" && result.reason instanceof UpstreamError) delay = Math.max(delay, result.reason.retryMs);
        if (results[0].status === "rejected") throw results[0].reason;
        if (results[1].status === "rejected") throw results[1].reason;
        const rewards = results[0].value;
        const burns = results[1].value;
        if (rewards.data.mint !== mint || burns.data.mint !== mint || rewards.data.mode !== token.data.token.mode || (rewards.data.mode === "reward" && rewards.data.quote?.mint !== token.data.token.quote.mint)) throw new Error("Feed identity mismatch");
        const sourceUpdatedAt = [token.updatedAt, rewards.updatedAt, burns.updatedAt].sort((a, b) => Date.parse(a) - Date.parse(b))[0];
        const data: StonkfunData = { token: token.data.token, rewards: rewards.data, burns: burns.data };
        next = { ...empty, data, sourceUpdatedAt, checkedAt: new Date().toISOString(), status: Date.now() - Date.parse(sourceUpdatedAt) > 15 * TTL ? "stale" : "live" };
      } catch (error) {
        if (error instanceof UpstreamError) delay = Math.max(delay, error.retryMs);
        next = previous?.data ? { ...previous, status: "stale", checkedAt: new Date().toISOString() } : { ...empty, status: !found && error instanceof UpstreamError && error.status === 404 ? "pending_listing" : "unavailable", checkedAt: new Date().toISOString() };
      }
      if (key === mint) { cached = next; retryAt = Date.now() + delay; }
      return next;
    })();
    pending = request;
    try { return await request; } finally { if (pending === request) pending = null; }
  };
}

const reader = createStonkfunReader();
export async function getStonkfunSnapshot(): Promise<StonkfunSnapshot> {
  const mint = process.env.NEXT_PUBLIC_SOLANA_TOKEN_MINT?.trim();
  const empty: StonkfunSnapshot = { status: "waiting_for_ca", mint: null, tokenUrl: null, sourceUpdatedAt: null, checkedAt: null, data: null };
  if (!mint) return empty;
  if (activeChainEnv() !== "mainnet") return { ...empty, status: "unsupported_network" };
  return reader(mint);
}
