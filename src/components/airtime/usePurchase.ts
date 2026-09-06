"use client";

import { useCallback, useState } from "react";
import { useWriteContract, usePublicClient, useAccount } from "wagmi";
import { BaseError, ContractFunctionRevertedError, type Hex } from "viem";
import { airtimePaymentsAbi, quoteStructFromWire } from "@/lib/chain/airtimePayments";
import { api, type QuoteDto, type CampaignDto } from "@/lib/api";
import { NATIVE_TOKEN } from "@/lib/chain/chains";

export type PurchasePhase = "idle" | "wallet" | "pending" | "confirming" | "verifying" | "confirmed" | "error";

export interface PurchaseState {
  phase: PurchasePhase;
  txHash: Hex | null;
  error: string | null;
  outcome: string | null;
}

function describeError(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? "Reverted";
      switch (name) {
        case "QuoteExpired":
          return "This quote expired before the transaction was mined. Request a new quote.";
        case "QuoteAlreadyConsumed":
          return "This quote has already been paid.";
        case "WrongPaymentAmount":
          return "The transaction value did not match the quote.";
        case "WrongBuyer":
          return "The connected wallet is not the wallet this quote was issued to.";
        case "InvalidSignature":
          return "The quote signature was rejected by the contract (wrong chain or contract).";
        case "EnforcedPause":
          return "Purchases are paused on the payment contract.";
        case "PlacementProtected":
          return "Another buyer completed first. Your transaction was reverted, so the payment value stayed in your wallet (network gas may still apply).";
        default:
          return `Contract rejected the purchase: ${name}`;
      }
    }
    return e.shortMessage;
  }
  return (e as Error)?.message ?? "Unknown error";
}

/**
 * Executes `purchase(quote, signature)` on AirtimePayments, waits for the
 * receipt, then asks the backend to verify the emitted event. The backend is
 * the only party that can mark the campaign paid.
 */
export function usePurchase() {
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient();
  const { address } = useAccount();
  const [state, setState] = useState<PurchaseState>({ phase: "idle", txHash: null, error: null, outcome: null });

  const reset = useCallback(() => setState({ phase: "idle", txHash: null, error: null, outcome: null }), []);

  /** Wait for the receipt, then let the server verify and mark the campaign paid. */
  const settle = useCallback(
    async (hash: Hex, campaignId: string): Promise<CampaignDto | null> => {
      if (!client) return null;
      setState({ phase: "pending", txHash: hash, error: null, outcome: null });
      try {
        const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
        if (receipt.status !== "success") {
          setState({ phase: "error", txHash: hash, error: "Transaction reverted on chain", outcome: null });
          return null;
        }
        // Wallet speed-ups replace the transaction hash. Verify the transaction
        // that actually mined, rather than polling the superseded hash forever.
        hash = receipt.transactionHash;
      } catch (e) {
        // A receipt timeout does not mean the payment failed. Keep the campaign
        // polling path active so the independent chain watcher can finish it.
        setState({ phase: "confirming", txHash: hash, error: null, outcome: `Receipt unavailable: ${describeError(e)}. The station is still checking your payment.` });
        return null;
      }
      setState({ phase: "verifying", txHash: hash, error: null, outcome: null });

      // Ask the backend to verify the event. It may need a moment for confirmations.
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          const res = await api<{ outcome: { status: string; reason?: string }; campaign: CampaignDto }>(`/api/campaigns/${campaignId}/confirm`, { method: "POST", json: { txHash: hash } });
          if (res.outcome.status === "confirmed" || ["PAID", "QUEUED", "AIRING", "COMPLETED"].includes(res.campaign.status)) {
            setState({ phase: "confirmed", txHash: hash, error: null, outcome: "confirmed" });
            return res.campaign;
          }
          if (res.outcome.status === "mismatch") {
            setState({ phase: "error", txHash: hash, error: `Payment could not be matched to the quote: ${res.outcome.reason}`, outcome: "mismatch" });
            return res.campaign;
          }
          setState({ phase: "confirming", txHash: hash, error: null, outcome: res.outcome.reason ?? "pending" });
        } catch (e) {
          setState({ phase: "confirming", txHash: hash, error: null, outcome: (e as Error).message });
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      setState({ phase: "confirming", txHash: hash, error: null, outcome: "Still waiting for confirmation. The station keeps watching the chain; this page updates automatically." });
      return null;
    },
    [client],
  );

  const pay = useCallback(
    async (quote: QuoteDto): Promise<CampaignDto | null> => {
      if (!client || !address) {
        setState({ phase: "error", txHash: null, error: "Connect your wallet before paying.", outcome: null });
        return null;
      }
      if (client.chain?.id !== quote.quote.chainId) {
        setState({ phase: "error", txHash: null, error: "Switch your wallet to the quoted network before paying.", outcome: null });
        return null;
      }
      const q = quoteStructFromWire(quote.quote);
      if (address && address.toLowerCase() !== q.buyer.toLowerCase()) {
        setState({ phase: "error", txHash: null, error: "Connected wallet differs from the quoted buyer", outcome: null });
        return null;
      }
      setState({ phase: "wallet", txHash: null, error: null, outcome: null });
      let hash: Hex;

      if (quote.settlement !== "contract") {
        setState({
          phase: "error",
          txHash: null,
          error: "This quote does not use AIRTIME's protected payment contract. Request a new quote before paying.",
          outcome: null,
        });
        return null;
      }

      try {
        // Simulate first so wallet users get a readable error instead of a failed tx.
        await client.simulateContract({
          address: quote.quote.contract,
          abi: airtimePaymentsAbi,
          functionName: "purchase",
          args: [q, quote.quote.signature],
          value: q.paymentToken === NATIVE_TOKEN ? q.amount : 0n,
          account: q.buyer,
        });
        hash = await writeContractAsync({
          address: quote.quote.contract,
          abi: airtimePaymentsAbi,
          functionName: "purchase",
          args: [q, quote.quote.signature],
          value: q.paymentToken === NATIVE_TOKEN ? q.amount : 0n,
          chainId: quote.quote.chainId,
        });
      } catch (e) {
        setState({ phase: "error", txHash: null, error: describeError(e), outcome: null });
        return null;
      }
      return await settle(hash, quote.campaignId);
    },
    [client, writeContractAsync, address, settle],
  );

  return { state, pay, reset };
}
