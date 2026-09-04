"use client";

import { PageFrame } from "@/components/hud/PageFrame";
import { BroadcastLog } from "@/components/hud/BroadcastLog";

export default function QueuePage() {
  return (
    <PageFrame title="Broadcast log">
      <p className="mb-4 max-w-2xl text-[12.5px] leading-relaxed text-ink-300">
        Every sponsored surface on the station, past and upcoming. Entries are real campaigns paid on Robinhood Chain; each links to its transaction and, once aired, to an AirLog receipt.
      </p>
      <div className="glass rounded-lg p-3">
        <BroadcastLog />
      </div>
    </PageFrame>
  );
}
