"use client";

import { PageFrame } from "@/components/hud/PageFrame";
import { InventoryList } from "@/components/hud/InventoryDrawer";
import { useMyCampaigns, useSession } from "@/lib/hooks";
import Link from "next/link";
import { formatDateTime, statusLabel, cn } from "@/lib/format";

export default function AirtimePage() {
  const session = useSession();
  const mine = useMyCampaigns(Boolean(session.data?.wallet));
  return (
    <PageFrame title="Buy airtime" wide>
      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <div>
          <p className="mb-4 max-w-2xl text-[12.5px] leading-relaxed text-ink-300">
            Every surface in the studio is programmable inventory: the picture during commercial breaks, overlays on the live feed, and architectural billboards in the room. You are not buying a thirty-second spot. Each surface asks a price that falls until somebody takes it, and whoever takes it runs there until another buyer pays more.
          </p>
          <div className="glass rounded-lg p-3">
            <InventoryList linkMode />
          </div>
        </div>
        <aside>
          <div className="label mb-2">Your campaigns</div>
          <div className="glass rounded-lg p-3">
            {!session.data?.wallet ? (
              <div className="text-[12px] text-ink-400">Connect and sign in with your wallet to see your campaigns.</div>
            ) : mine.data?.campaigns.length ? (
              <ul className="flex flex-col gap-1.5">
                {mine.data.campaigns.map((c) => (
                  <li key={c.id}>
                    <Link href={`/campaign/${c.id}`} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-white/[0.04]">
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px] text-ink-50">{c.displayName}</div>
                        <div className="mono truncate text-[10px] uppercase tracking-[0.12em] text-ink-400">
                          {c.placement.name} · {c.startsAt ? (c.endsAt ? `ran until ${formatDateTime(c.endsAt)}` : `on air since ${formatDateTime(c.startsAt)}`) : "not on air yet"}
                        </div>
                      </div>
                      <span className={cn("chip", c.status === "AIRING" ? "chip-live" : ["PAID", "COMPLETED"].includes(c.status) ? "chip-signal" : "")}>{statusLabel(c.status)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-[12px] text-ink-400">No campaigns yet.</div>
            )}
          </div>
        </aside>
      </div>
    </PageFrame>
  );
}
