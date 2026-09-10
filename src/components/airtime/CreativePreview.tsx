"use client";

import type { CreativeDto, PlacementDto } from "@/lib/api";
import { cn } from "@/lib/format";

/** Uses checkout's own state so previews cannot leak between open campaigns. */
export function CreativePreview({ creative, placement, fit, displayName, clickUrl }: {
  creative: CreativeDto;
  placement: PlacementDto;
  fit: "FIT" | "FILL";
  displayName: string;
  clickUrl: string;
}) {
  const mediaClass = cn("absolute inset-0 h-full w-full", fit === "FILL" ? "object-cover" : "object-contain");
  const [width, height] = placement.aspectRatio.split(":").map(Number);
  return <figure className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-3" data-testid="creative-preview" data-fit={fit}>
    <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <span className="label text-signal">Your ad preview</span>
      <span className="readout text-[10px] text-ink-300">{placement.aspectRatio} · {fit === "FIT" ? "Fit" : "Fill"}</span>
    </figcaption>
    <div className="relative mx-auto w-full overflow-hidden bg-black" style={{ aspectRatio: `${width} / ${height}`, maxWidth: 420 * width / height }} data-testid="creative-preview-surface">
      {creative.type === "TEXT" ? (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden px-3 text-center text-sm text-signal">{creative.textContent}</div>
      ) : creative.type === "VIDEO" ? (
        <video src={creative.url ?? undefined} poster={creative.posterUrl ?? undefined} controls muted loop playsInline className={mediaClass} aria-label="Your ad video preview" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={creative.url ?? ""} alt="Your ad with the selected framing" className={mediaClass} />
      )}
    </div>
    <div className="mt-3 min-w-0 border-t border-white/10 pt-3" aria-live="polite">
      <p className="break-words text-sm font-medium text-ink-50" data-testid="preview-ad-caption">{displayName}</p>
      {clickUrl && <p className="mt-1 break-all text-[11px] text-signal" data-testid="preview-ad-destination">Visit advertiser ↗ · {clickUrl}</p>}
      <p className="mt-1 text-[10px] text-ink-400">Shown with your ad in the surface details.</p>
    </div>
    <p className="mt-2 text-[11px] leading-relaxed text-ink-300" aria-live="polite">
      {fit === "FIT" ? "Fit shows the entire ad. Black bars appear when its shape differs from the surface." : "Fill covers the entire surface. Edges may be cropped to fit."}
    </p>
  </figure>;
}
