import { defineChain, type Chain } from "viem";
import { foundry, mainnet, sepolia } from "viem/chains";

/**
 * Robinhood Chain network definitions.
 * Chain ids and public RPC endpoints are the official values; explorer URLs
 * can be overridden with NEXT_PUBLIC_EXPLORER_URL.
 */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Robinhood Chain Explorer", url: "https://explorer.mainnet.chain.robinhood.com" },
  },
});

export const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Robinhood Chain Testnet Explorer", url: "https://explorer.testnet.chain.robinhood.com" },
  },
  testnet: true,
});

/** Local anvil chain used for development and E2E tests. */
export const localChain: Chain = {
  ...foundry,
  name: "AIRTIME Local (anvil)",
};

export type ChainEnv = "local" | "testnet" | "mainnet";

export function chainForEnv(envName: ChainEnv): Chain {
  switch (envName) {
    case "mainnet":
      return robinhoodChain;
    case "testnet":
      return robinhoodChainTestnet;
    default:
      return localChain;
  }
}

/** The chain the app is configured for (browser + server share this). */
export function activeChainEnv(): ChainEnv {
  const v = process.env.NEXT_PUBLIC_CHAIN_ENV;
  if (v === "mainnet" || v === "testnet" || v === "local") return v;
  return "local";
}

/**
 * Where a buyer may pay from.
 *
 * Chains the station knows how to read. New quotes are restricted to the active
 * chain because the protected payment contract is deployed there; the other
 * entries remain available for recognizing legacy treasury-settled records.
 * The first entry is the network the app prefers and the one a wallet is asked
 * to switch to when nothing is chosen.
 *
 * Override the list with NEXT_PUBLIC_PAYMENT_CHAIN_IDS (comma separated).
 */
export function paymentChains(): Chain[] {
  const byEnv: Record<ChainEnv, Chain[]> = {
    mainnet: [robinhoodChain, mainnet],
    testnet: [robinhoodChainTestnet, sepolia],
    local: [localChain],
  };
  const all = byEnv[activeChainEnv()];
  const configured = process.env.NEXT_PUBLIC_PAYMENT_CHAIN_IDS;
  if (!configured) return all;
  const wanted = configured
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isInteger(n));
  const known = [robinhoodChain, robinhoodChainTestnet, mainnet, sepolia, localChain];
  const picked = wanted.map((id) => known.find((c) => c.id === id)).filter((c): c is Chain => Boolean(c));
  return picked.length ? picked : all;
}

export function isPaymentChain(chainId: number): boolean {
  return paymentChains().some((c) => c.id === chainId);
}

export function chainById(chainId: number): Chain | null {
  return paymentChains().find((c) => c.id === chainId) ?? null;
}

/** Short label for the interface: "Robinhood Chain", "Ethereum", … */
export function chainLabel(chainId: number): string {
  const c = chainById(chainId);
  if (!c) return `Chain ${chainId}`;
  if (c.id === mainnet.id) return "Ethereum";
  if (c.id === sepolia.id) return "Sepolia";
  return c.name;
}

export { mainnet as ethereumMainnet, sepolia as ethereumSepolia };

export function activeChain(): Chain {
  return chainForEnv(activeChainEnv());
}

export function explorerBaseUrl(): string | null {
  const override = process.env.NEXT_PUBLIC_EXPLORER_URL;
  if (override) return override.replace(/\/$/, "");
  const c = activeChain();
  if (c.id === foundry.id) return null;
  return c.blockExplorers?.default.url ?? null;
}

export function explorerTxUrl(hash: string): string | null {
  const base = explorerBaseUrl();
  return base ? `${base}/tx/${hash}` : null;
}

export function explorerAddressUrl(address: string): string | null {
  const base = explorerBaseUrl();
  return base ? `${base}/address/${address}` : null;
}

export const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000" as const;

export interface PaymentAsset {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  isNative: boolean;
}

/**
 * Payment assets that can be selected in the UI. Native ETH always works.
 * ERC-20 assets (e.g. USDG) only become selectable once a verified contract
 * address is provided through configuration – we never invent addresses.
 */
export function paymentAssets(): PaymentAsset[] {
  const assets: PaymentAsset[] = [{ address: NATIVE_TOKEN, symbol: "ETH", decimals: 18, isNative: true }];
  const usdg = process.env.NEXT_PUBLIC_USDG_ADDRESS;
  if (usdg && /^0x[0-9a-fA-F]{40}$/.test(usdg)) {
    assets.push({ address: usdg as `0x${string}`, symbol: "USDG", decimals: 6, isNative: false });
  }
  return assets;
}
