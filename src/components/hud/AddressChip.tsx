"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/format";

function shortenAddress(address: string, lead = 6, tail = 4): string {
  return address.length <= lead + tail + 1 ? address : `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/**
 * Click-to-copy address chip.
 *
 * Shows the first and last characters only, copies the full address, and links
 * out to a block explorer when one is configured for the active chain. The
 * shortened form is display only: nothing in the app ever compares against it.
 */
export function AddressChip({
  address,
  label,
  explorerUrl,
  className,
}: {
  address: string;
  label: string;
  explorerUrl?: string | null;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      // Clipboard permission denied: select it instead so it can be copied by hand.
      const range = document.createRange();
      const node = document.getElementById(`addr-${address}`);
      if (node) {
        range.selectNodeContents(node);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={copy}
        title={`${label}: ${address} (click to copy)`}
        aria-label={`Copy ${label.toLowerCase()} address ${address}`}
        className="mono inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-ink-300 transition hover:border-white/25 hover:text-ink-50"
      >
        <span className="text-ink-500">{label}</span>
        <span id={`addr-${address}`} className="text-ink-200">
          {shortenAddress(address)}
        </span>
        <span className={cn("transition-colors", copied ? "text-signal" : "text-ink-500")} aria-hidden>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </span>
        <span className="sr-only" aria-live="polite">
          {copied ? "Address copied" : ""}
        </span>
      </button>
      {explorerUrl && (
        <a href={explorerUrl} target="_blank" rel="noreferrer noopener" className="mono text-[10px] uppercase tracking-[0.12em] text-ink-500 transition hover:text-signal" title="Open in the block explorer">
          ↗
        </a>
      )}
    </span>
  );
}

/**
 * The token contract. There is no token yet, so this states that plainly rather
 * than showing a placeholder address: a mock-up contract in the interface is
 * indistinguishable from a real one to anyone reading it.
 *
 * When the token ships, set NEXT_PUBLIC_TOKEN_ADDRESS and this becomes an
 * ordinary copyable chip with no other change.
 */
export function TokenContractChip({ className }: { className?: string }) {
  const configured = process.env.NEXT_PUBLIC_TOKEN_ADDRESS;
  if (configured && /^0x[0-9a-fA-F]{40}$/.test(configured)) {
    return <AddressChip address={configured} label="Contract" className={className} />;
  }
  return (
    <span
      className={cn(
        "mono inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-ink-500",
        className,
      )}
      title="The AIRTIME token contract has not been deployed yet"
    >
      <span>Contract</span>
      <span className="text-ink-300">Coming soon</span>
    </span>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
      <path d="M10.5 5.5v-1a1.6 1.6 0 0 0-1.6-1.6H4.1A1.6 1.6 0 0 0 2.5 4.5v4.8a1.6 1.6 0 0 0 1.6 1.6h1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8.5l3.2 3.2L13 5" />
    </svg>
  );
}
