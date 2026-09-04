"use client";

import { PageFrame } from "@/components/hud/PageFrame";
import { BroadcastLog } from "@/components/hud/BroadcastLog";

export default function QueuePage() {
  return (
    <PageFrame title="Broadcast log">
      <p className="mb-4 max-w-2xl text-[12.5px] leading-relaxed text-ink-300">
        Who is standing on which surface right now, and who was outbid off one recently. Entries are real runs paid for on Robinhood Chain; each links to its transaction and, once the run ends, to an AirLog receipt. There is no queue: a surface has one occupant and they hold it until somebody pays more.
      </p>
      <div className="glass rounded-lg p-3">
        <BroadcastLog />
      </div>
    </PageFrame>
  );
}
