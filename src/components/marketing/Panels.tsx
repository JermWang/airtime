"use client";

import { useTreasury, useQueue } from "@/lib/hooks";
import { StationPlayer } from "@/components/station/StationPlayer";
import { activeChain } from "@/lib/chain/chains";
import { formatWei, formatPercentFromPpm, shortHash, cn } from "@/lib/format";

/**
 * The two halves of a panel: the picture on the front, the record on the back.
 *
 * The four static fronts are project-owned artwork, not stock imagery. They are
 * fixed editorial stills committed under public/panels and are not regenerated
 * by the art build. The picture panel shows the live programme,
 * because a frame grab of the station is never as good as the station itself.
 *
 * Every figure on the backs is read from the endpoints the station runs on. Where
 * there is nothing to show yet they say so with a dash rather than a placeholder
 * number.
 */

/* -------------------------------------------------------------------------- */
/*  Fronts                                                                    */
/* -------------------------------------------------------------------------- */

function Art({ src, alt, position = "50% 50%" }: { src: string; alt: string; position?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="h-full w-full object-cover" style={{ objectPosition: position }} draggable={false} />
  );
}

export const ClockArt = () => <Art src="/panels/clock-straight.webp" alt="A price stepping down toward its floor" position="50% 34%" />;
export const HonestyArt = () => (
  <Art src="/panels/honesty-verification.webp" alt="A wallet card verified while a gathered audience remains indistinct" position="50% 40%" />
);
export const TreasuryArt = () => (
  <div className="relative h-full w-full">
    <Art src="/panels/treasury-safe.webp" alt="A secure safe holding document bundles under lime light" position="50% 36%" />
    <div
      role="img"
      aria-label="Anduril"
      className="pointer-events-none absolute right-5 top-5 h-[118px] w-[100px] mix-blend-screen opacity-95 [background-position:center] [background-repeat:no-repeat] [background-size:430%_auto] drop-shadow-[0_3px_16px_rgba(0,0,0,0.8)]"
      style={{ backgroundImage: 'url("/anduril%20logo.png")' }}
    />
  </div>
);
export const RoomArt = () => <Art src="/panels/room-watch-party.webp" alt="Friends sharing a programme in a private screening room" position="50% 38%" />;
export const PortraitArt = () => <Art src="/team/jeff-miller.webp" alt="Jeff Miller" position="50% 22%" />;

/**
 * The programme itself, exactly as it is going out.
 *
 * This is the one front whose content nobody controls: it might be a night
 * exterior or it might be white end credits. A flat scrim over the picture keeps
 * the headline legible whatever is airing, without hiding what is on.
 */
export function PictureArt({ channelId = "MAIN" }: { channelId?: string }) {
  return (
    <div className="relative h-full w-full">
      <StationPlayer channelId={channelId} visible fit="cover" className="h-full w-full" overlays={false} />
      <div className="pointer-events-none absolute inset-0 bg-ink-950/45" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Backs                                                                     */
/* -------------------------------------------------------------------------- */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="mono text-[10.5px] text-ink-400">{label}</span>
      <span className="mono truncate text-[10.5px] text-ink-50">{value}</span>
    </>
  );
}

/**
 * The two kinds of fact, in separate boxes so they can never be read as one
 * number: what the chain settled, and what the application measured.
 */
export function ProofBlocks({ channelId = "MAIN" }: { channelId?: string }) {
  const { data } = useQueue(channelId);
  const latest = data?.recent?.[0] ?? data?.onAir?.[0] ?? null;
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="rounded-lg border border-white/10 bg-black/30 p-4">
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-ink-300">Payment · verified on chain</div>
        <div className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <Row label="Amount" value={latest?.pricePaidWei ? formatWei(latest.pricePaidWei) : "—"} />
          <Row label="Network" value={activeChain().name} />
          <Row label="Transaction" value={latest?.txHash ? shortHash(latest.txHash) : "—"} />
        </div>
      </div>
      <div className="rounded-lg border border-white/10 bg-black/30 p-4">
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-ink-300">Delivery · first-party analytics</div>
        <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <Row label="Sessions present" value="—" />
          <Row label="Tab visibility while airing" value="not measured" />
          <Row label="Video completions" value="—" />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
          Application measurements, not on-chain facts and not cryptographically verified impressions.
        </p>
      </div>
    </div>
  );
}

/** The ledger, four figures wide. */
export function LedgerGrid() {
  const { data } = useTreasury();
  const s = data?.summary;
  const cells: Array<[string, string, string, boolean]> = [
    ["Airtime revenue", s ? formatWei(s.airtimeRevenueWei) : "—", "Derived from chain", false],
    ["Spent on pre-stock", s ? formatWei(s.deployedWei) : "—", "Operator recorded", false],
    ["Held", s ? `${s.sharesHeld} sh` : "—", "Acquired minus distributed", false],
    ["Reward cap per holder", `${formatPercentFromPpm(s?.holderRewardCapPpm ?? 50)}%`, "Of the pre-IPO allocation", true],
  ];
  return (
    <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg border border-white/12">
      {cells.map(([label, value, sub, accent], i) => (
        <div key={label} className={cn("p-4", i % 2 === 0 && "border-r border-white/[0.08]", i > 1 && "border-t border-white/[0.08]")}>
          <div className="mono text-[9px] uppercase tracking-[0.16em] text-ink-400">{label}</div>
          <div className={cn("mono mt-2.5 text-[22px] leading-none tracking-[-0.03em]", accent ? "text-signal" : "text-ink-50")}>{value}</div>
          <div className="mono mt-2 text-[9px] uppercase tracking-[0.14em] text-ink-500">{sub}</div>
        </div>
      ))}
    </div>
  );
}
