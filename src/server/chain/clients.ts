import { createPublicClient, http, type PublicClient } from "viem";
import { chainById, isPaymentChain, paymentChains, robinhoodChain, robinhoodChainTestnet, ethereumMainnet, ethereumSepolia } from "@/lib/chain/chains";
import { env } from "../env";

/**
 * One RPC client per payment chain.
 *
 * A buyer may pay on Robinhood Chain or on Ethereum, so verification cannot
 * assume a single network: it reads each transaction from the RPC belonging to
 * the chain the quote was issued for. Public endpoints are a fallback only;
 * point the *_RPC_URL variables at dedicated providers in production.
 */

declare global {
  var __airtimeChainClients: Map<number, PublicClient> | undefined;
}

export function rpcUrlFor(chainId: number): string {
  const e = env();
  switch (chainId) {
    case robinhoodChain.id:
      return e.ROBINHOOD_MAINNET_RPC_URL;
    case robinhoodChainTestnet.id:
      return e.ROBINHOOD_TESTNET_RPC_URL;
    case ethereumMainnet.id:
      return e.ETHEREUM_RPC_URL || ethereumMainnet.rpcUrls.default.http[0];
    case ethereumSepolia.id:
      return e.ETHEREUM_RPC_URL || ethereumSepolia.rpcUrls.default.http[0];
    default:
      return e.LOCAL_RPC_URL;
  }
}

export function clientFor(chainId: number): PublicClient {
  if (!isPaymentChain(chainId)) {
    throw new Error(`Chain ${chainId} is not accepted for payment`);
  }
  const cache = (globalThis.__airtimeChainClients ??= new Map());
  const existing = cache.get(chainId);
  if (existing) return existing;
  const chain = chainById(chainId) ?? paymentChains()[0];
  const client = createPublicClient({
    chain,
    transport: http(rpcUrlFor(chainId), { batch: true, retryCount: 2, timeout: 15_000 }),
  });
  cache.set(chainId, client);
  return client;
}

export function resetChainClientsForTests(): void {
  globalThis.__airtimeChainClients = undefined;
}
