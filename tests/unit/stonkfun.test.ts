import { afterEach, describe, expect, it, vi } from "vitest";
import { createStonkfunReader, getStonkfunSnapshot } from "@/server/stonkfun";

const mint = "HcRLc9VDgjLeK154xDawfb1dmVJ98DoSqcwTHGqiDeJR";
const other = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";
const quote = { mint: "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS", symbol: "ZEC", decimals: 8 };
const token = () => ({ network: "mainnet-beta", token: { mint, name: "Example", symbol: "EX", mode: "reward", quote, market: { priceUsd: 0.1, marketCapUsd: 1000, volume24hUsd: 20, priceChange24h: -3 }, transferFee: { bps: 300 }, flywheel: { active: true } } });
const rewards = () => ({ mint, mode: "reward", quote, rewards: { distributedTokens: 123.45, undistributedTokens: 0.3, payoutCount: 500, holderCount: 50, lastPayoutAt: new Date().toISOString() } });
const burns = () => ({ mint, totals: { amountTokens: 0, valueUsdAtBurn: 0, burnCount: 0, lastBurnAt: null }, burns: [] });
function mockFeed(transform?: (data: ReturnType<typeof token> | ReturnType<typeof rewards> | ReturnType<typeof burns>, url: string) => unknown) {
  return vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const data = url.includes("/rewards") ? rewards() : url.includes("/burns") ? burns() : token();
    return Response.json({ data: transform ? transform(data, url) : data, meta: { generatedAt: new Date().toISOString() } });
  }));
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("StonkFun mint-bound reporting", () => {
  it("makes no requests before the CA is configured or on another network", async () => {
    vi.stubGlobal("fetch", vi.fn()); vi.stubEnv("NEXT_PUBLIC_SOLANA_TOKEN_MINT", "");
    expect((await getStonkfunSnapshot()).status).toBe("waiting_for_ca");
    vi.stubEnv("NEXT_PUBLIC_SOLANA_TOKEN_MINT", mint); vi.stubEnv("NEXT_PUBLIC_SOLANA_NETWORK", "devnet");
    expect((await getStonkfunSnapshot()).status).toBe("unsupported_network");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects malformed CAs without calling an upstream URL", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect((await createStonkfunReader()("../../another-host")).status).toBe("invalid_ca");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reads all three official token feeds and coalesces/caches requests", async () => {
    mockFeed(); const read = createStonkfunReader();
    const [a, b] = await Promise.all([read(mint), read(mint)]);
    expect(a.status).toBe("live"); expect(b).toEqual(a);
    expect(a.data?.rewards.rewards?.distributedTokens).toBe(123.45);
    expect(a.data?.burns.totals.amountTokens).toBe(0);
    await read(mint); expect(fetch).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(fetch).mock.calls) expect(String(call[0])).toMatch(/^https:\/\/www\.stonkfun\.xyz\/api\/public\/v1\/tokens\//);
  });
  it("never shows another coin's metrics for the configured CA", async () => {
    mockFeed((data, url) => !url.includes("/rewards") && !url.includes("/burns") ? { ...token(), token: { ...token().token, mint: other } } : data);
    const snapshot = await createStonkfunReader()(mint);
    expect(snapshot.status).toBe("unavailable"); expect(snapshot.data).toBeNull();
  });
  it("rejects reward data for the wrong paired asset", async () => {
    mockFeed((data, url) => url.includes("/rewards") ? { ...rewards(), quote: { ...quote, mint: other } } : data);
    expect((await createStonkfunReader()(mint)).data).toBeNull();
  });
  it("accepts Standard Mode's null rewards without inventing payouts", async () => {
    mockFeed((data, url) => url.includes("/rewards") ? { mint, mode: "standard", rewards: null } : url.includes("/burns") ? data : { ...token(), token: { ...token().token, mode: "standard" } });
    const snapshot = await createStonkfunReader()(mint);
    expect(snapshot.status).toBe("live"); expect(snapshot.data?.rewards.rewards).toBeNull();
  });
  it("waits for a newly published mint to be indexed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "not_found" } }, { status: 404 })));
    expect((await createStonkfunReader()(mint)).status).toBe("pending_listing");
  });
  it("keeps last known numbers marked stale during an outage and honors Retry-After", async () => {
    vi.useFakeTimers(); mockFeed(); const read = createStonkfunReader();
    const good = await read(mint); vi.advanceTimersByTime(60_001);
    vi.mocked(fetch).mockImplementation(async () => Response.json({}, { status: 429, headers: { "Retry-After": "120" } }));
    const stale = await read(mint); expect(stale.status).toBe("stale"); expect(stale.data).toEqual(good.data); expect(stale.sourceUpdatedAt).toBe(good.sourceUpdatedAt);
    const calls = vi.mocked(fetch).mock.calls.length;
    vi.advanceTimersByTime(60_001); await read(mint); expect(fetch).toHaveBeenCalledTimes(calls);
    vi.advanceTimersByTime(60_001); await read(mint); expect(fetch).toHaveBeenCalledTimes(calls + 1);
  });
  it("clears the previous coin's cached data when the CA changes", async () => {
    mockFeed(); const read = createStonkfunReader(); await read(mint);
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const next = await read(other); expect(next.status).toBe("unavailable"); expect(next.data).toBeNull();
  });
});
