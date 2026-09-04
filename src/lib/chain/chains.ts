import { defineChain, type Chain } from "viem";
import { foundry } from "viem/chains";

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
