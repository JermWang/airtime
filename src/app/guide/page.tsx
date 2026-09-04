"use client";

import { PageFrame } from "@/components/hud/PageFrame";
import { ProgramGuide } from "@/components/hud/ProgramGuide";

export default function GuidePage() {
  return (
    <PageFrame title="Program guide">
      <div className="glass rounded-lg p-3">
        <ProgramGuide hours={12} full />
      </div>
    </PageFrame>
  );
}
