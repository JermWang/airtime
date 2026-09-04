"use client";

import { StationPlayer } from "@/components/station/StationPlayer";
import { StatusRail } from "@/components/hud/StatusRail";
import { ProgramGuide } from "@/components/hud/ProgramGuide";
import { BroadcastLog } from "@/components/hud/BroadcastLog";
import { MobileDock } from "@/components/hud/MobileDock";

/** 2D station: the picture, guide and broadcast log. No WebGL required. */
export default function WatchPage() {
  return (
    <main className="min-h-dvh bg-ink-950 pb-24 pt-16 md:pb-8">
      <StatusRail compact />
      <div className="mx-auto grid max-w-[1400px] gap-4 px-3 md:grid-cols-[1fr_340px] md:px-6">
        <div className="overflow-hidden rounded-lg border border-white/10 bg-black shadow-[0_40px_120px_rgba(0,0,0,0.7)]">
          <StationPlayer visible className="aspect-video w-full" />
        </div>
        <div className="flex flex-col gap-4">
          <section className="glass rounded-lg p-3">
            <div className="label mb-2">Guide</div>
            <ProgramGuide className="max-h-[38vh]" />
          </section>
          <section className="glass rounded-lg p-3">
            <div className="label mb-2">Broadcast log</div>
            <BroadcastLog className="max-h-[38vh]" compact />
          </section>
        </div>
      </div>
      <MobileDock />
    </main>
  );
}
