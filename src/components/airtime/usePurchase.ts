"use client";
import { useCallback, useState } from "react";
import { Transaction } from "@solana/web3.js";
import { useSolanaWallet } from "@/lib/solana-wallet";
import { api, type QuoteDto, type CampaignDto } from "@/lib/api";
import { activeChain } from "@/lib/chain/chains";
export type PurchasePhase = "idle" | "wallet" | "pending" | "confirming" | "verifying" | "confirmed" | "error";
export interface PurchaseState { phase: PurchasePhase; txHash: string | null; error: string | null; outcome: string | null }
export function usePurchase() {
 const { address, signTransaction } = useSolanaWallet();
 const [state, setState] = useState<PurchaseState>({ phase: "idle", txHash: null, error: null, outcome: null });
 const reset = useCallback(() => setState({ phase: "idle", txHash: null, error: null, outcome: null }), []);
 const pay = useCallback(async (quote: QuoteDto): Promise<CampaignDto | null> => {
  if (!address || address !== quote.quote.buyer || quote.chainId !== activeChain().id || quote.settlement !== "solana") {
   setState({ phase: "error", txHash: null, error: "Connect the Solana wallet this quote was issued to.", outcome: null }); return null;
  }
  let signature: string | null = null;
  let submitted = false;
  try {
   setState({ phase: "wallet", txHash: null, error: null, outcome: null });
   const prepared = await api<{ transaction: string }>(`/api/campaigns/${quote.campaignId}/transaction`, { method: "POST", json: {} });
   const tx = Transaction.from(Uint8Array.from(atob(prepared.transaction), c => c.charCodeAt(0)));
   const signed = await signTransaction(tx);
   const bytes = signed.serialize();
   // From this point a response timeout is ambiguous; don't invite a second payment.
   submitted = true;
   const result = await api<{ signature: string }>(`/api/campaigns/${quote.campaignId}/transaction`, { method: "POST", json: { signedTransaction: btoa(String.fromCharCode(...bytes)) } });
   signature = result.signature;
   for (let attempt = 0; attempt < 30; attempt++) {
    setState({ phase: "confirming", txHash: signature, error: null, outcome: "Waiting for Solana finality" });
    try {
     const res = await api<{ outcome: { status: string; reason?: string }; campaign: CampaignDto }>(`/api/campaigns/${quote.campaignId}/confirm`, { method: "POST", json: { txHash: signature } });
     if (res.outcome.status === "confirmed") { setState({ phase: "confirmed", txHash: signature, outcome: "confirmed", error: res.campaign.status === "REJECTED" ? (res.campaign.rejectionReason ?? "Payment received. Contact the station for a refund.") : null }); return res.campaign; }
     if (res.outcome.status === "mismatch") throw new Error(res.outcome.reason ?? "Payment mismatch");
    } catch { /* Scheduler also checks the signature saved before submission. */ }
    await new Promise(r => setTimeout(r, 2000));
   }
   return null;
  } catch (e) {
   setState({ phase: submitted ? "confirming" : "error", txHash: signature, error: submitted ? null : (e as Error).message, outcome: submitted ? "Submission status is uncertain. The station is checking; do not pay again." : null });
   return null;
  }
 }, [address, signTransaction]);
 return { state, pay, reset };
}
