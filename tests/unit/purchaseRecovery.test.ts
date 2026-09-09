import { beforeEach, expect, it, vi } from "vitest";
import type { QuoteDto } from "@/lib/api";
const mocks = vi.hoisted(() => ({ setState: vi.fn(), signTransaction: vi.fn(), api: vi.fn() }));
vi.mock("react", () => ({ useCallback: (fn: unknown) => fn, useState: (initial: unknown) => [initial, mocks.setState] }));
vi.mock("@/lib/solana-wallet", () => ({ useSolanaWallet: () => ({ address: "buyer", signTransaction: mocks.signTransaction }) }));
vi.mock("@solana/web3.js", () => ({ Transaction: { from: () => ({}) } }));
vi.mock("@/lib/api", () => ({ api: mocks.api }));
import { usePurchase } from "@/components/airtime/usePurchase";
const quote = { campaignId: "campaign", settlement: "solana", chainId: 902, quote: { buyer: "buyer" } } as QuoteDto;
beforeEach(() => { vi.resetAllMocks(); mocks.signTransaction.mockResolvedValue({ serialize: () => new Uint8Array([1,2,3]) }); });
it("confirms the server-broadcast Solana signature", async () => {
 mocks.api.mockResolvedValueOnce({ transaction: "AQID" }).mockResolvedValueOnce({ signature: "signature" }).mockResolvedValueOnce({ outcome: { status: "confirmed" }, campaign: { status:"AIRING" } });
 expect(await usePurchase().pay(quote)).toEqual({ status:"AIRING" });
 expect(mocks.setState).toHaveBeenLastCalledWith(expect.objectContaining({ phase:"confirmed", txHash:"signature" }));
});
it("keeps recovery active when submission response is lost", async () => {
 mocks.api.mockResolvedValueOnce({ transaction: "AQID" }).mockRejectedValueOnce(new Error("timeout"));
 expect(await usePurchase().pay(quote)).toBeNull();
 expect(mocks.setState).toHaveBeenLastCalledWith(expect.objectContaining({ phase:"confirming", error:null }));
});
it("allows retry after wallet rejection before submission", async () => {
 mocks.api.mockResolvedValueOnce({ transaction: "AQID" }); mocks.signTransaction.mockRejectedValueOnce(new Error("Rejected"));
 await usePurchase().pay(quote);
 expect(mocks.api).toHaveBeenCalledTimes(1); expect(mocks.setState).toHaveBeenLastCalledWith(expect.objectContaining({ phase:"error" }));
});
it("does not pay a quote for a different network", async () => { await usePurchase().pay({...quote,chainId:900}); expect(mocks.api).not.toHaveBeenCalled(); });
