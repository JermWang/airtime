import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { activeChain, activeChainEnv } from "@/lib/chain/chains";
import { env } from "../env";

/**
 * Server-side RPC client. Uses the dedicated provider URL from the environment
 * (Alchemy etc.) and only falls back to the public endpoint when nothing else is
 * configured. Requests are batched to keep RPC usage low.
 */

declare global {
  // eslint-disable-next-line no-var
  var __airtimePublicClient: PublicClient | undefined;
}

export function serverRpcUrl(): string {
  const e = env();
  switch (activeChainEnv()) {
    case "mainnet":
      return e.ROBINHOOD_MAINNET_RPC_URL;
    case "testnet":
      return e.ROBINHOOD_TESTNET_RPC_URL;
    default:
      return e.LOCAL_RPC_URL;
  }
}

export function publicClient(): PublicClient {
  if (!globalThis.__airtimePublicClient) {
    globalThis.__airtimePublicClient = createPublicClient({
      chain: activeChain(),
      transport: http(serverRpcUrl(), { batch: true, retryCount: 2, timeout: 15_000 }),
    });
  }
  return globalThis.__airtimePublicClient;
}

export function paymentContractAddress(): Address | null {
  const a = env().NEXT_PUBLIC_AIRTIME_PAYMENT_CONTRACT;
  return /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as Address) : null;
}

export function requiredConfirmations(): number {
  return env().AIRTIME_PAYMENT_CONFIRMATIONS;
}

export function resetPublicClientForTests(): void {
  globalThis.__airtimePublicClient = undefined;
}
