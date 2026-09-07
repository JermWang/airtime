import type { ShowcaseDto } from "@/lib/api";
import { cn } from "@/lib/format";

/**
 * A house card in the DOM.
 *
 * The same thing the room draws into a texture, for the flat surfaces: the
 * station's own example of what a spot on this surface looks like, drawn from
 * text alone and stamped EXAMPLE for as long as it is on screen. It is never
 * anybody's campaign, so it always says the surface is still available.
 */
export function HouseCard({ card, size = "panel" }: { card: Pick<ShowcaseDto, "label" | "headline" | "sublabel" | "accent">; size?: "panel" | "screen" }) {
  const screen = size === "screen";
  return (
    <div className={cn("relative flex h-full w-full flex-col justify-center overflow-hidden bg-[linear-gradient(135deg,#07090c,#12161b)]", screen ? "px-[6%]" : "px-2.5 pb-7 pt-2")}>
      <div className={cn("flex min-w-0 gap-3", screen ? "gap-5" : "gap-2.5")}>
        <span className={cn("shrink-0 rounded-[1px] bg-signal", screen ? "w-[5px]" : "w-[3px]")} />
        <div className="min-w-0">
          <div className={cn("readout truncate uppercase tracking-[0.16em] text-signal", screen ? "text-[13px]" : "text-[8.5px]")}>{card.label}</div>
          <div className={cn("mt-1 font-medium leading-[1.05] tracking-[-0.03em] text-ink-50 [text-wrap:balance]", screen ? "text-[clamp(28px,4.4vw,64px)]" : "line-clamp-2 text-[12.5px]")}>
            {card.headline}
          </div>
          {/* A panel is barely taller than its own price chip on a phone, and
              the EXAMPLE badge already says what this is; the line only earns
              its space on the picture. */}
          {card.sublabel && screen && <div className="readout mt-1.5 text-[11px] uppercase leading-relaxed tracking-[0.12em] text-ink-400">{card.sublabel}</div>}
        </div>
      </div>
      <span
        className={cn(
          "readout absolute rounded-sm border border-white/25 bg-white/[0.06] uppercase tracking-[0.18em] text-ink-100",
          // On the picture the corners are taken by the station's own chips, so
          // the badge sits bottom-left where nothing else lands.
          screen ? "bottom-4 left-4 px-2.5 py-[6px] text-[10px]" : "right-1.5 top-1.5 px-1.5 py-[3px] text-[7.5px]",
        )}
      >
        Example
      </span>
    </div>
  );
}
