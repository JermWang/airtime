"use client";

import type { CreativeDto } from "@/lib/api";
import { cn } from "@/lib/format";

/** One media canvas for checkout and playback, independent of the surrounding wall layout. */
export function AdSurface({ creative, aspectRatio, fit, label = "Advertisement", controls = false }: {
  creative: Pick<CreativeDto, "type" | "url" | "posterUrl" | "textContent">;
  aspectRatio: string;
  fit: "FIT" | "FILL";
  label?: string;
  controls?: boolean;
}) {
  const [width, height] = aspectRatio.split(":").map(Number);
  const ratio = width > 0 && height > 0 ? width / height : 1;
  const mediaClass = cn("absolute inset-0 h-full w-full", fit === "FILL" ? "object-cover" : "object-contain");
  return <div className="relative h-full w-full overflow-hidden bg-black [container-type:size]">
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-black"
      style={{ width: `min(100cqw, ${100 * ratio}cqh)`, aspectRatio: ratio }}
      data-testid="ad-surface-frame" data-aspect-ratio={aspectRatio} data-fit={fit}>
      {creative.type === "TEXT" ? (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden p-[5%] text-center text-signal">{creative.textContent}</div>
      ) : creative.type === "VIDEO" ? (
        <video src={creative.url ?? undefined} poster={creative.posterUrl ?? undefined} controls={controls} autoPlay={!controls} muted loop playsInline className={mediaClass} aria-label={label} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={creative.url ?? ""} alt={label} className={mediaClass} />
      )}
    </div>
  </div>;
}
