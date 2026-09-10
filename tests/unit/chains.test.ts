import { afterEach, expect, it } from "vitest";
import { activeChain, paymentChains, explorerTxUrl, isPaymentChain, paymentAssets } from "@/lib/chain/chains";
const original = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
afterEach(() => { process.env.NEXT_PUBLIC_SOLANA_NETWORK = original; });
it("accepts only the configured Solana network", () => {
 process.env.NEXT_PUBLIC_SOLANA_NETWORK = "mainnet";
 expect(activeChain().name).toBe("Solana");
 expect(paymentChains().map(c => c.id)).toEqual([900]);
 expect(isPaymentChain(4663)).toBe(false); expect(isPaymentChain(901)).toBe(false);
 expect(paymentAssets()).toEqual([{address:"SOL", symbol:"SOL", decimals:9, isNative:true}]);
});
it("links devnet signatures with the cluster and never relabels historical signatures", () => {
 process.env.NEXT_PUBLIC_SOLANA_NETWORK = "devnet";
 expect(explorerTxUrl("signature")).toBe("https://solscan.io/tx/signature?cluster=devnet");
 expect(explorerTxUrl("0x123",4663)).toBeNull();
 expect(explorerTxUrl("signature",900)).toBe("https://solscan.io/tx/signature");
 expect(explorerTxUrl("signature",902)).toBeNull();
});
