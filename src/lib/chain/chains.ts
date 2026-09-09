/** Internal network keys; historical ledger IDs remain unchanged. */
export type ChainEnv = "local" | "devnet" | "mainnet";
export interface Chain { id: number; name: string; cluster: "mainnet-beta" | "devnet" | "custom"; nativeCurrency: { name: string; symbol: string; decimals: number }; rpcUrls: { default: { http: string[] } }; }
export const NATIVE_TOKEN = "SOL";
const currency = { name: "Solana", symbol: "SOL", decimals: 9 };
const networks: Record<ChainEnv, Chain> = {
 mainnet: { id: 900, name: "Solana", cluster: "mainnet-beta", nativeCurrency: currency, rpcUrls: { default: { http: ["https://api.mainnet-beta.solana.com"] } } },
 devnet: { id: 901, name: "Solana Devnet", cluster: "devnet", nativeCurrency: currency, rpcUrls: { default: { http: ["https://api.devnet.solana.com"] } } },
 local: { id: 902, name: "Solana Localnet", cluster: "custom", nativeCurrency: currency, rpcUrls: { default: { http: ["http://127.0.0.1:8899"] } } },
};
export function activeChainEnv(): ChainEnv { const v = process.env.NEXT_PUBLIC_SOLANA_NETWORK; return v === "mainnet" || v === "local" ? v : "devnet"; }
export const chainForEnv = (name: ChainEnv): Chain => networks[name];
export const activeChain = (): Chain => chainForEnv(activeChainEnv());
export const paymentChains = (): Chain[] => [activeChain()];
export const isPaymentChain = (id: number): boolean => id === activeChain().id;
export const chainById = (id: number): Chain | null => Object.values(networks).find((c) => c.id === id) ?? null;
export const chainLabel = (id: number): string => chainById(id)?.name ?? "Archived network";
export const explorerBaseUrl = (): string | null => activeChainEnv() === "local" ? null : "https://explorer.solana.com";
function explorerUrl(kind: string, value: string, chainId = activeChain().id): string | null {
 const c = chainById(chainId);
 if (!c || c.cluster === "custom" || value.startsWith("0x")) return null;
 return `https://explorer.solana.com/${kind}/${encodeURIComponent(value)}${c.cluster === "devnet" ? "?cluster=devnet" : ""}`;
}
export const explorerTxUrl = (signature: string, chainId?: number) => explorerUrl("tx", signature, chainId);
export const explorerAddressUrl = (address: string) => explorerUrl("address", address);
export interface PaymentAsset { address: string; symbol: string; decimals: number; isNative: boolean }
export const paymentAssets = (): PaymentAsset[] => [{ address: NATIVE_TOKEN, symbol: "SOL", decimals: 9, isNative: true }];

export function airtimeTokenDecimals(): number { const n = Number(process.env.NEXT_PUBLIC_AIRTIME_TOKEN_DECIMALS ?? "9"); return Number.isInteger(n) && n >= 0 && n <= 18 ? n : 9; }
