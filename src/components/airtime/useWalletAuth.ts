"use client";

import { useCallback, useState } from "react";
import { useAccount, useChainId, useSignMessage, useSwitchChain, useDisconnect } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { createSiweMessage } from "viem/siwe";
import { api } from "@/lib/api";
import { useSession } from "@/lib/hooks";
import { activeChain } from "@/lib/chain/chains";

/**
 * Sign-In With Ethereum. The wallet session is only needed when the user wants
 * to buy airtime, so nothing here runs until `signIn()` is called.
 */
export function useWalletAuth() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { disconnect } = useDisconnect();
  const session = useSession();
  const qc = useQueryClient();
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = activeChain();
  const wrongChain = isConnected && chainId !== target.id;
  const signedIn = Boolean(session.data?.wallet && address && session.data.wallet.address === address.toLowerCase());

  const ensureChain = useCallback(async () => {
    if (chainId === target.id) return true;
    try {
      await switchChainAsync({ chainId: target.id });
      return true;
    } catch (e) {
      setError((e as Error).message?.split("\n")[0] ?? "Could not switch network");
      return false;
    }
  }, [chainId, target.id, switchChainAsync]);

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!address) return false;
    setError(null);
    setSigning(true);
    try {
      if (!(await ensureChain())) return false;
      const { nonce } = await api<{ nonce: string }>("/api/auth/nonce");
      const message = createSiweMessage({
        address,
        chainId: target.id,
        domain: window.location.host,
        nonce,
        uri: window.location.origin,
        version: "1",
        statement: "Sign in to AIRTIME to buy airtime. This signature costs nothing.",
        issuedAt: new Date(),
        expirationTime: new Date(Date.now() + 10 * 60 * 1000),
      });
      const signature = await signMessageAsync({ message });
      await api("/api/auth/verify", { method: "POST", json: { message, signature } });
      await qc.invalidateQueries({ queryKey: ["session"] });
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
      return true;
    } catch (e) {
      setError((e as Error).message?.split("\n")[0] ?? "Sign-in failed");
      return false;
    } finally {
      setSigning(false);
    }
  }, [address, ensureChain, target.id, signMessageAsync, qc]);

  const signOut = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      disconnect();
      await qc.invalidateQueries({ queryKey: ["session"] });
    }
  }, [disconnect, qc]);

  return { address, isConnected, wrongChain, signedIn, signIn, signOut, ensureChain, signing, switching, error, targetChain: target, sessionLoading: session.isLoading };
}
