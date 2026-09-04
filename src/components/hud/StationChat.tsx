"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/store";
import { useSession } from "@/lib/hooks";
import { useWalletAuth } from "@/components/airtime/useWalletAuth";
import { shortAddress, cn } from "@/lib/format";

export const CHAT_MAX_CHARS = 280;

interface ChatMessageDto {
  id: string;
  channelId: string;
  wallet: string;
  body: string;
  at: string;
}

/**
 * Station chat.
 *
 * Reading is open to everyone; posting requires a connected wallet that has
 * signed in, because the wallet is the identity shown next to each line. New
 * messages arrive over the realtime bus, with a slow poll as a backstop for
 * when the event stream is reconnecting.
 *
 * Message bodies are rendered as text. Nothing a viewer types is ever treated
 * as markup, here or on the server.
 */
export function StationChat({ channelId = "MAIN", className, compact = false }: { channelId?: string; className?: string; compact?: boolean }) {
  const qc = useQueryClient();
  const { address, isConnected } = useAccount();
  const { data: session } = useSession();
  const auth = useWalletAuth();
  const chatVersion = useRealtime((s) => s.versions["chat.message"] ?? 0);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  const { data, isLoading } = useQuery({
    queryKey: ["chat", channelId],
    queryFn: () => api<{ messages: ChatMessageDto[] }>(`/api/chat?channel=${channelId}&limit=80`),
    refetchInterval: 20_000,
  });
  const messages = useMemo(() => data?.messages ?? [], [data]);

  // The bus tells us a message landed; refetch rather than trusting a payload.
  useEffect(() => {
    if (chatVersion > 0) void qc.invalidateQueries({ queryKey: ["chat", channelId] });
  }, [chatVersion, channelId, qc]);

  // Follow the bottom of the room, unless the reader has scrolled up to read back.
  useEffect(() => {
    const el = listRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  const signedIn = Boolean(session?.wallet);
  const remaining = CHAT_MAX_CHARS - draft.length;

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await api<{ message: ChatMessageDto }>("/api/chat", { method: "POST", json: { channel: channelId, body } });
      setDraft("");
      pinned.current = true;
      await qc.invalidateQueries({ queryKey: ["chat", channelId] });
    } catch (e) {
      setError((e as Error).message || "Could not send that");
    } finally {
      setSending(false);
    }
  }, [draft, sending, channelId, qc]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div ref={listRef} onScroll={onScroll} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
        {isLoading && <div className="label p-2">Loading the room…</div>}
        {!isLoading && messages.length === 0 && (
          <div className="p-2 text-[12px] leading-relaxed text-ink-400">Nobody has said anything yet. Connect a wallet and open the room.</div>
        )}
        <ul className="flex flex-col gap-2">
          {messages.map((m) => {
            const mine = address ? m.wallet.toLowerCase() === address.toLowerCase() : false;
            return (
              <li key={m.id} className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-2">
                  <span className={cn("mono text-[10px] uppercase tracking-[0.12em]", mine ? "text-signal" : "text-ink-400")}>{shortAddress(m.wallet)}</span>
                  <time className="mono text-[9px] uppercase tracking-[0.12em] text-ink-600" dateTime={m.at} suppressHydrationWarning>
                    {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </div>
                <p className="break-words text-[12.5px] leading-snug text-ink-100">{m.body}</p>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-3 border-t border-white/8 pt-3">
        {!isConnected && <ConnectHint label="Connect a wallet to talk" />}
        {isConnected && !signedIn && (
          <button className="btn btn-sm w-full" onClick={() => void auth.signIn()} disabled={auth.signing}>
            {auth.signing ? "Check your wallet…" : "Sign in to talk"}
          </button>
        )}
        {isConnected && signedIn && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-end gap-2"
          >
            <div className="min-w-0 flex-1">
              <input
                className="field"
                value={draft}
                maxLength={CHAT_MAX_CHARS}
                placeholder={compact ? "Say something" : "Say something to the room"}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (error) setError(null);
                }}
                aria-label="Chat message"
              />
            </div>
            <button className="btn btn-primary btn-sm shrink-0" type="submit" disabled={sending || !draft.trim()}>
              {sending ? "…" : "Send"}
            </button>
          </form>
        )}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className={cn("text-[11px]", error ? "text-amber" : "text-ink-500")}>
            {error ?? (signedIn ? "One message every couple of seconds. Be decent." : "")}
          </span>
          {signedIn && <span className={cn("mono text-[10px]", remaining < 30 ? "text-amber" : "text-ink-600")}>{remaining}</span>}
        </div>
      </div>
    </div>
  );
}

function ConnectHint({ label }: { label: string }) {
  return <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-ink-300">{label}</div>;
}
