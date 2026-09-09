"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicKey, Transaction } from "@solana/web3.js";
interface Provider {
 publicKey: PublicKey | null;
 connect(): Promise<{ publicKey: PublicKey }>;
 disconnect(): Promise<void>;
 signMessage(message: Uint8Array, display?: string): Promise<{ signature: Uint8Array } | Uint8Array>;
 signTransaction(transaction: Transaction): Promise<Transaction>;
 on?(event: string, fn: (...args: unknown[]) => void): void;
 removeListener?(event: string, fn: (...args: unknown[]) => void): void;
}
type WalletName = "Phantom" | "Solflare";
function injected(name: WalletName): Provider | undefined {
 const w = window as unknown as { phantom?: { solana?: Provider }; solflare?: Provider };
 return name === "Phantom" ? w.phantom?.solana : w.solflare;
}
interface WalletState {
 address: string | undefined; isConnected: boolean; isPending: boolean;
 connect(name: WalletName): Promise<void>; disconnect(): Promise<void>;
 signMessage(message: Uint8Array): Promise<Uint8Array>;
 signTransaction(tx: Transaction): Promise<Transaction>;
}
const Context = createContext<WalletState | null>(null);
export function SolanaWalletProvider({ children }: { children: ReactNode }) {
 const [provider, setProvider] = useState<Provider | null>(null);
 const [address, setAddress] = useState<string>();
 const [isPending, setPending] = useState(false);
 const connect = useCallback(async (name: WalletName) => {
  const p = injected(name);
  if (!p) throw new Error(`Open this site in ${name}'s browser or install its browser extension.`);
  setPending(true);
  try { const result = await p.connect(); setProvider(p); setAddress(result.publicKey.toBase58()); }
  finally { setPending(false); }
 }, []);
 useEffect(() => {
  if (!provider) return;
  const changed = () => setAddress(provider.publicKey?.toBase58());
  const disconnected = () => { setAddress(undefined); setProvider(null); };
  provider.on?.("accountChanged", changed); provider.on?.("disconnect", disconnected);
  return () => { provider.removeListener?.("accountChanged", changed); provider.removeListener?.("disconnect", disconnected); };
 }, [provider]);
 const disconnect = useCallback(async () => { try { await provider?.disconnect(); } finally { setProvider(null); setAddress(undefined); } }, [provider]);
 const signMessage = useCallback(async (message: Uint8Array) => {
  if (!provider) throw new Error("Connect a Solana wallet");
  const result = await provider.signMessage(message, "utf8");
  return result instanceof Uint8Array ? result : result.signature;
 }, [provider]);
 const signTransaction = useCallback(async (tx: Transaction) => {
  if (!provider) throw new Error("Connect a Solana wallet");
  return provider.signTransaction(tx);
 }, [provider]);
 return <Context.Provider value={{ address, isConnected: Boolean(address), isPending, connect, disconnect, signMessage, signTransaction }}>{children}</Context.Provider>;
}
export function useSolanaWallet() { const value = useContext(Context); if (!value) throw new Error("Solana wallet provider missing"); return value; }
export const useAccount = useSolanaWallet;
