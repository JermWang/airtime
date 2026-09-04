"use client";

import { useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { AnimatePresence, motion } from "motion/react";
import { useWalletAuth } from "@/components/airtime/useWalletAuth";
import { shortAddress, cn } from "@/lib/format";

/**
 * Wallet control. Deliberately quiet: it only becomes prominent when the user
 * is buying airtime (the purchase flow calls the same hooks).
 */
export function WalletButton({ prominent = false, className }: { prominent?: boolean; className?: string }) {
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending } = useConnect();
  const auth = useWalletAuth();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (isConnected && address) {
    return (
      <div className={cn("relative", className)}>
        <button className={cn("btn btn-sm", prominent && "btn-primary")} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className={cn("h-1.5 w-1.5 rounded-full", auth.wrongChain ? "bg-amber" : auth.signedIn ? "bg-signal" : "bg-ink-300")} />
          <span className="mono">{shortAddress(address)}</span>
        </button>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="glass-strong absolute right-0 top-full z-40 mt-2 w-64 rounded-lg p-3 text-xs">
              <div className="label mb-2">Wallet</div>
              <div className="mono mb-3 break-all text-ink-100">{address}</div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-ink-300">Network</span>
                <span className={cn("chip", auth.wrongChain ? "chip-amber" : "chip-signal")}>{auth.wrongChain ? "Wrong chain" : auth.targetChain.name}</span>
              </div>
              {auth.wrongChain && (
                <button className="btn btn-primary mb-2 w-full" onClick={() => void auth.ensureChain()} disabled={auth.switching}>
                  {auth.switching ? "Switching…" : `Switch to ${auth.targetChain.name}`}
                </button>
              )}
              {!auth.signedIn && !auth.wrongChain && (
                <button className="btn mb-2 w-full" onClick={() => void auth.signIn()} disabled={auth.signing}>
                  {auth.signing ? "Check your wallet…" : "Sign in"}
                </button>
              )}
              {auth.error && <div className="mb-2 text-[11px] text-live">{auth.error}</div>}
              <button className="btn btn-ghost w-full" onClick={() => void auth.signOut().then(() => setOpen(false))}>
                Disconnect
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <button className={cn("btn btn-sm", prominent && "btn-primary")} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Connect wallet
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="glass-strong absolute right-0 top-full z-40 mt-2 w-64 rounded-lg p-3">
            <div className="label mb-2">Choose a wallet</div>
            <div className="flex flex-col gap-1.5">
              {connectors.map((c) => (
                <button
                  key={c.uid}
                  className="btn w-full justify-between"
                  disabled={isPending}
                  onClick={async () => {
                    setErr(null);
                    try {
                      await connectAsync({ connector: c });
                      setOpen(false);
                    } catch (e) {
                      setErr((e as Error).message?.split("\n")[0] ?? "Connection failed");
                    }
                  }}
                >
                  <span>{c.name}</span>
                  {c.type === "airtimeDev" && <span className="chip chip-amber">dev</span>}
                </button>
              ))}
            </div>
            {err && <div className="mt-2 text-[11px] text-live">{err}</div>}
            <div className="mt-3 text-[10px] leading-relaxed text-ink-400">Built on Robinhood Chain. Robinhood Wallet connects through WalletConnect or its browser extension.</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
