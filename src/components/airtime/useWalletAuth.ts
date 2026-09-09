"use client";
import { useCallback, useState } from "react";
import bs58 from "bs58";
import { useQueryClient } from "@tanstack/react-query";
import { useSolanaWallet } from "@/lib/solana-wallet";
import { api } from "@/lib/api";
import { useSession } from "@/lib/hooks";
import { activeChain } from "@/lib/chain/chains";
import { signInMessage } from "@/lib/chain/solana";
export function useWalletAuth() {
 const { address, isConnected, signMessage, disconnect } = useSolanaWallet();
 const session = useSession(); const qc = useQueryClient();
 const [signing, setSigning] = useState(false); const [error, setError] = useState<string | null>(null);
 const target = activeChain();
 const signedIn = Boolean(address && session.data?.wallet?.address === address && session.data.wallet.chainId === target.id);
 const ensureChain = useCallback(async () => true, []);
 const signIn = useCallback(async () => {
  if (!address) return false;
  setError(null); setSigning(true);
  try {
   const { nonce } = await api<{ nonce: string }>("/api/auth/nonce");
   const fields = { address, origin: window.location.origin, nonce, chainId: target.id };
   const signature = bs58.encode(await signMessage(new TextEncoder().encode(signInMessage(fields))));
   await api("/api/auth/verify", { method: "POST", json: { ...fields, signature } });
   await qc.invalidateQueries({ queryKey: ["session"] }); await qc.invalidateQueries({ queryKey: ["campaigns"] }); return true;
  } catch (e) { setError((e as Error).message); return false; } finally { setSigning(false); }
 }, [address, target.id, signMessage, qc]);
 const signOut = useCallback(async () => {
  try { await api("/api/auth/logout", { method: "POST" }); }
  finally { await disconnect(); await qc.invalidateQueries({ queryKey: ["session"] }); }
 }, [disconnect, qc]);
 return { address, isConnected, wrongChain: false, signedIn, signIn, signOut, ensureChain, signing, switching: false, error, targetChain: target, sessionLoading: session.isLoading };
}
