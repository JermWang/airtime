import type { ShowcaseDto } from "@/lib/api";

/**
 * A house card in the DOM.
 *
 * The same thing the room draws into a texture, for the flat surfaces: what
 * the station is standing on a surface nobody has booked, drawn from text
 * alone. It is not a campaign — no queue entry, no AirLog, no revenue — and it
 * says the surface is still available.
 */
export function HouseCard({ card, size = "panel" }: { card: Pick<ShowcaseDto, "label" | "headline" | "sublabel" | "accent">; size?: "panel" | "screen" }) {
  const screen = size === "screen";


  // On the picture there is room to centre the card. A panel is the size of a
  // business card, so nothing is positioned over anything else there: the
  // ticker takes a line and the name takes the rest.
  if (!screen) {
    return (
      // The bottom strip is where the price chip floats, so the card's own
      // text stops above it: the artwork still runs the full height of the
      // surface behind it.
      <div className="flex h-full w-full flex-col gap-1 overflow-hidden bg-[linear-gradient(135deg,#07090c,#12161b)] p-1.5 pb-[19px]">
        {/* leading-none so the line box hugs the glyphs instead of reaching
            into the row below. */}
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="h-2 w-[3px] shrink-0 rounded-[1px] bg-signal" />
          <span className="readout min-w-0 flex-1 truncate text-[8px] uppercase leading-none tracking-[0.14em] text-signal">{card.label}</span>
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
    </div>
  );
}

