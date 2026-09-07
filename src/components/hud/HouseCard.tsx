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
  const badge = (
    <span
      className={cn(
        "readout shrink-0 rounded-sm border border-white/25 bg-white/[0.06] uppercase tracking-[0.18em] text-ink-100",
        screen ? "absolute bottom-4 left-4 px-2.5 py-[6px] text-[10px]" : "px-1 py-[2px] text-[7px]",
      )}
    >
      Example
    </span>
  );

  // On the picture there is room to centre the card and hang the badge in a
  // corner. A panel is the size of a business card, so nothing there is
  // positioned over anything else: the ticker and the badge share a row, the
  // name takes what is left, and whatever does not fit is clipped by the box
  // rather than printed over its neighbour.
  if (!screen) {
    return (
      <div className="flex h-full w-full flex-col gap-1 overflow-hidden bg-[linear-gradient(135deg,#07090c,#12161b)] p-1.5">
        <div className="flex min-w-0 items-start gap-1.5">
          <span className="mt-[1px] h-2.5 w-[3px] shrink-0 rounded-[1px] bg-signal" />
          <span className="readout min-w-0 flex-1 truncate text-[8px] uppercase tracking-[0.14em] text-signal">{card.label}</span>
          {badge}
        </div>
        {/*
          The name takes whatever room is left and fades out at the bottom edge
          if it runs past it. A fixed line clamp cannot do this: the same card
          is drawn on a squat panel above the picture and on a tower four times
          its height, and any number that suits one slices a line in half on the
          other.
        */}
        <div className="min-h-0 flex-1 overflow-hidden text-[12px] font-medium leading-[1.15] tracking-[-0.02em] text-ink-50 [mask-image:linear-gradient(to_bottom,#000_calc(100%-7px),transparent)] [overflow-wrap:anywhere]">
          {card.headline}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col justify-center overflow-hidden bg-[linear-gradient(135deg,#07090c,#12161b)] px-[6%]">
      <div className="flex min-w-0 gap-5">
        <span className="w-[5px] shrink-0 rounded-[1px] bg-signal" />
        <div className="min-w-0">
          <div className="readout truncate text-[13px] uppercase tracking-[0.16em] text-signal">{card.label}</div>
          <div className="mt-1 text-[clamp(28px,4.4vw,64px)] font-medium leading-[1.05] tracking-[-0.03em] text-ink-50 [text-wrap:balance]">{card.headline}</div>
          {card.sublabel && <div className="readout mt-1.5 text-[11px] uppercase leading-relaxed tracking-[0.12em] text-ink-400">{card.sublabel}</div>}
        </div>
      </div>
      {badge}
    </div>
  );
}
