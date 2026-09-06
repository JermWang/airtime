import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuoteDto } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  setState: vi.fn(),
  simulate: vi.fn(),
  receipt: vi.fn(),
  write: vi.fn(),
  api: vi.fn(),
  chainId: 31337,
  address: "0x1111111111111111111111111111111111111111" as string | undefined,
}));
// Exercise the asynchronous payment orchestration without a browser renderer.
vi.mock("react", () => ({ useCallback: (fn: unknown) => fn, useState: (initial: unknown) => [initial, mocks.setState] }));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: mocks.address }),
  useWriteContract: () => ({ writeContractAsync: mocks.write }),
  usePublicClient: () => ({ chain: { id: mocks.chainId }, simulateContract: mocks.simulate, waitForTransactionReceipt: mocks.receipt }),
}));
vi.mock("@/lib/api", () => ({ api: mocks.api }));

import { usePurchase } from "@/components/airtime/usePurchase";

const original = `0x${"11".repeat(32)}` as const;
const replacement = `0x${"22".repeat(32)}` as const;
const quote: QuoteDto = {
  campaignId: "campaign-id", settlement: "contract",
  amountWei: "1000", breakdown: [], expiresAt: "2026-09-06T12:00:00Z",
  startsAt: "2026-09-06T11:00:00Z", guaranteedUntil: "2026-09-06T11:01:00Z",
  guaranteedSeconds: 60, placementId: "AD", outbids: null, treasury: null,
  payTo: "0x2222222222222222222222222222222222222222", chainId: 31337,
  quote: {
    quoteId: original, buyer: "0x1111111111111111111111111111111111111111",
    placementId: original, creativeHash: original, startAt: "1", endAt: "100",
    expiresAt: "90", nonce: "1", amount: "1000", paymentToken: "0x0000000000000000000000000000000000000000",
    signature: "0x12", chainId: 31337, contract: "0x2222222222222222222222222222222222222222",
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.chainId = 31337;
  mocks.address = quote.quote.buyer;
  mocks.write.mockResolvedValue(original);
  mocks.simulate.mockResolvedValue({});
  mocks.receipt.mockResolvedValue({ status: "success", transactionHash: replacement });
  mocks.api.mockResolvedValue({ outcome: { status: "confirmed" }, campaign: { id: quote.campaignId, status: "AIRING" } });
});

describe("purchase recovery", () => {
  it("verifies the mined replacement hash after a wallet speed-up", async () => {
    await expect(usePurchase().pay(quote)).resolves.toMatchObject({ status: "AIRING" });
    expect(mocks.api).toHaveBeenCalledWith("/api/campaigns/campaign-id/confirm", { method: "POST", json: { txHash: replacement } });
    expect(mocks.setState).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "confirmed", txHash: replacement }));
  });

  it("keeps independent confirmation polling active after a receipt timeout", async () => {
    mocks.receipt.mockRejectedValue(new Error("RPC timeout"));
    await expect(usePurchase().pay(quote)).resolves.toBeNull();
    expect(mocks.setState).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "confirming", txHash: original, error: null }));
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });

  it("does not verify a reverted transaction", async () => {
    mocks.receipt.mockResolvedValue({ status: "reverted", transactionHash: original });
    await expect(usePurchase().pay(quote)).resolves.toBeNull();
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.setState).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "error" }));
  });

  it("refuses to simulate or send on the wrong network", async () => {
    mocks.chainId = 1;
    await expect(usePurchase().pay(quote)).resolves.toBeNull();
    expect(mocks.simulate).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("reports a disconnected wallet before attempting payment", async () => {
    mocks.address = undefined;
    await expect(usePurchase().pay(quote)).resolves.toBeNull();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.setState).toHaveBeenLastCalledWith(expect.objectContaining({ error: "Connect your wallet before paying." }));
  });
});
