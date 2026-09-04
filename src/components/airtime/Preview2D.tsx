"use client";

import { useStation } from "@/lib/store";
import { StationPlayer } from "@/components/station/StationPlayer";
import type { PlacementDto } from "@/lib/api";
import { cn } from "@/lib/format";

/**
 * Non-WebGL preview. Overlay/full-screen placements are previewed directly on
 * the real station picture; studio surfaces are shown as a framed panel with
 * the exact aspect ratio, framing and safe zones.
 */
export function Preview2D({ placement, className }: { placement: PlacementDto; className?: string }) {
  const preview = useStation((s) => s.preview);
  const safe = useStation((s) => s.showSafeZones);
  const [aw, ah] = placement.aspectRatio.split(":").map(Number);

  if (placement.type === "OVERLAY" || placement.type === "FULLSCREEN") {
    return (
      <div className={cn("relative aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-black", className)}>
        <StationPlayer visible className="h-full w-full" />
        {placement.type === "FULLSCREEN" && preview && (
          <div className="absolute inset-0 bg-black">
            {preview.kind === "video" ? (
              <video src={preview.url} muted loop autoPlay playsInline className={cn("h-full w-full", preview.fit === "FILL" ? "object-cover" : "object-contain")} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt="" className={cn("h-full w-full", preview.fit === "FILL" ? "object-cover" : "object-contain")} />
            )}
          </div>
        )}
        <div className="absolute left-2 top-2 chip">Live preview</div>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative w-full overflow-hidden rounded-md border-[6px] border-[#0c0d0f] bg-black shadow-[0_30px_80px_rgba(0,0,0,0.6)]" style={{ aspectRatio: `${aw} / ${ah}` }}>
        {preview ? (
          preview.kind === "video" ? (
            <video src={preview.url} muted loop autoPlay playsInline className={cn("h-full w-full", preview.fit === "FILL" ? "object-cover" : "object-contain")} />
          ) : preview.kind === "text" ? (
            <div className="mono flex h-full w-full items-center whitespace-nowrap px-6 text-[4cqw] uppercase tracking-[0.14em] text-signal" style={{ containerType: "inline-size" }}>
              {preview.text}
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt="" className={cn("h-full w-full", preview.fit === "FILL" ? "object-cover" : "object-contain")} />
          )
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[radial-gradient(ellipse_at_center,#14171b,#07080a)]">
            <div className="label-strong">Available airtime</div>
            <div className="mono text-[10px] text-ink-500">{placement.aspectRatio}</div>
          </div>
        )}
        {safe && <div className="pointer-events-none absolute inset-[5%] border border-dashed border-signal/60" />}
      </div>
      <div className="mono mt-2 text-center text-[10px] uppercase tracking-[0.14em] text-ink-400">
        {placement.name} · {placement.aspectRatio}
        {placement.meshName ? ` · ${placement.meshName}` : ""}
      </div>
    </div>
  );
}
