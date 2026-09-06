"use client";
import { useCallback, useRef, useState } from "react";

import Link from "next/link";
import { useServerNow, useBoard } from "@/lib/hooks";
import { useLiveAsk } from "@/components/airtime/AskTicker";
import { StationChat } from "@/components/hud/StationChat";
import { SoundControl, SoundBlockedPrompt } from "@/components/hud/SoundControl";
import { ContentNotice } from "@/components/hud/ContentNotice";
import { SiteFooter } from "@/components/hud/SiteFooter";
import { MobileDock } from "@/components/hud/MobileDock";
import { Wordmark } from "@/components/hud/Wordmark";
import { Reveal, RevealWords } from "@/components/marketing/Reveal";
import { FlipCard } from "@/components/marketing/FlipCard";
import { SurfaceWall, PriceTicker } from "@/components/marketing/SurfaceWall";
import { LogoRow } from "@/components/marketing/LogoRow";
import { SignalStory } from "@/components/marketing/SignalStory";
import { ClockArt, PictureArt, HonestyArt, TreasuryArt, RoomArt, PortraitArt, ProofBlocks, LedgerGrid } from "@/components/marketing/Panels";
import { formatClock, formatWei } from "@/lib/format";

/**
 * The station front page.
 *
 * The fold is the wall: the live picture with a display panel either side of it,
 * each wearing its own price, so the first thing anybody sees is that all four
 * surfaces are for sale and what they cost this second. Under it the prices run
 * past on a strip, and then the whole argument is six panels you turn over — the
 * front is the picture, the back is the detail.
 *
 * Nothing on this page is a drawing of the product. Every price, figure and
 * frame is read from the same endpoints the station runs on.
 */
export function StationHome({ channelId = "MAIN" }: { channelId?: string }) {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-ink-950 text-ink-100">
      <SoundBlockedPrompt />
      <ContentNotice />
      <SiteHeader />
      <Fold channelId={channelId} />
      <PriceTicker channelId={channelId} seconds={90} />
      <div className="border-b border-white/[0.09] bg-ink-950 py-5">
        <LogoRow label="Partners / infrastructure" speedSec={54} />
      </div>
      <SignalStory />
      <Panels channelId={channelId} />
      <ClosingCta />
      <SiteFooter wide />
      <MobileDock />
    </div>
  );
}

/* ---- header -------------------------------------------------------------- */

const NAV = [
  { href: "#clock", label: "The clock" },
  { href: "#picture", label: "The picture" },
  { href: "#honesty", label: "Honesty" },
  { href: "#treasury", label: "Treasury" },
  { href: "#room", label: "The room" },
];

function SiteHeader() {
  const now = useServerNow(1000);
  return (
    <header
      className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-4 px-6 backdrop-blur-[14px]"
      style={{ height: 60, background: "linear-gradient(180deg,rgba(5,6,7,.82),rgba(5,6,7,0))" }}
    >
      <Link href="/" className="flex shrink-0 items-center">
        <Wordmark size={12.5} />
      </Link>
      <nav className="mono hidden items-center gap-7 text-[10px] uppercase tracking-[0.18em] md:flex">
        {NAV.map((n) => (
          <a key={n.href} href={n.href} className="text-ink-300 transition hover:text-signal">
            {n.label}
          </a>
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-3">
        <SoundControl compact />
        <span className="mono hidden whitespace-nowrap text-[10px] tracking-[0.16em] tabular-nums text-ink-400 lg:inline" suppressHydrationWarning>
          {formatClock(now)} UTC
        </span>
        <a
          href="#panels"
          className="mono inline-flex h-[34px] items-center justify-center whitespace-nowrap rounded-sm bg-signal px-4 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#0d1400] transition hover:bg-[#d9ff33]"
        >
          Buy airtime
        </a>
      </div>
    </header>
  );
}

/* ---- the fold ------------------------------------------------------------ */

function Fold({ channelId }: { channelId: string }) {
  const [expanded, setExpanded] = useState(false);
  const section = useRef<HTMLElement>(null);

  const toggle = useCallback(() => {
    setExpanded((wasExpanded) => {
      // Expanding is only worth anything if the wall is what you are looking at.
      if (!wasExpanded) requestAnimationFrame(() => section.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return !wasExpanded;
    });
  }, []);

  return (
    <section id="top" ref={section} className="relative w-full bg-ink-950">
      {/*
        Laid out in flow rather than as an overlay inside a clipped, fixed-height
        fold. The copy under the wall used to be absolutely positioned in a
        100svh box with overflow hidden, so on a shorter screen the headline was
        simply cut off at the bottom edge instead of pushing the page taller.

        Expanded, the wall is given the whole viewport and the copy starts below
        it, so it is off the fold entirely rather than half on screen.
      */}
      <div className="flex min-h-[max(100svh,760px)] flex-col pt-[70px]">
        <SurfaceWall
          channelId={channelId}
          sizeClassName={expanded ? "h-[max(calc(100svh-70px),690px)] shrink-0" : "flex-1"}
          expanded={expanded}
          onToggleExpand={toggle}
        />

        <div className="shrink-0 border-t border-white/[0.09] px-6 pb-20 pt-4 md:pb-4">
          <div className="mx-auto flex max-w-[1560px] flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <div className="min-w-0 flex-[1_1_380px]">
              <Reveal y={12} immediate>
                <div className="mono flex items-center gap-3 text-[10px] uppercase tracking-[0.2em]">
                  <span className="text-ink-200">Airtime Main</span>
                  <span className="h-[11px] w-px bg-white/20" />
                  <span className="text-ink-300">Four surfaces</span>
                </div>
              </Reveal>
              <h1 className="mt-3 max-w-[22ch] text-[clamp(30px,4.2vw,68px)] font-medium leading-[0.94] tracking-[-0.05em] text-ink-50 [text-wrap:pretty]">
                <RevealWords text="Buy a piece of the channel." immediate />
              </h1>
            </div>

            <div className="min-w-0 max-w-lg flex-[1_1_330px]">
              <Reveal delay={0.3} y={14} immediate>
                <p className="text-[13.5px] leading-relaxed text-ink-200">
                  Every surface above is inventory. The price on each one falls until somebody takes it, payment settles on chain, and the station verifies it
                  before a frame airs.
                </p>
              </Reveal>
              <Reveal delay={0.4} y={14} immediate>
                <div className="mt-3.5 flex flex-wrap items-center gap-3">
                  <Link
                    href="/airtime"
                    className="mono inline-flex h-[42px] items-center justify-center whitespace-nowrap rounded-sm bg-signal px-[22px] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0d1400] transition hover:bg-[#d9ff33]"
                  >
                    Buy airtime
                  </Link>
                  <Link
                    href="/watch"
                    className="mono inline-flex h-[42px] items-center justify-center whitespace-nowrap rounded-sm border border-white/25 px-[22px] text-[11px] uppercase tracking-[0.16em] text-ink-100 transition hover:border-white/45 hover:bg-white/[0.06]"
                  >
                    Watch full screen
                  </Link>
                </div>
              </Reveal>
              <Reveal delay={0.48} y={14} immediate>
                <div className="mono mt-3 text-[9.5px] uppercase tracking-[0.16em] text-ink-300">
                  Every surface opens at <span className="text-signal">0.01 ETH</span> · a sale resets it to twice what was paid
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---- the panels ---------------------------------------------------------- */

function Panels({ channelId }: { channelId: string }) {
  return (
    <section id="panels" className="w-full bg-ink-950">
      <div className="mx-auto max-w-[1560px] px-6 pb-[132px] pt-[120px]">
        <Reveal y={14}>
          <div className="mono flex flex-wrap items-baseline justify-between gap-5 border-b border-white/10 pb-[22px] text-[10px] uppercase tracking-[0.2em]">
            <span className="inline-flex items-baseline gap-5">
              <span className="text-signal">The network</span>
              <span className="text-ink-300">Six panels</span>
            </span>
            <span className="text-ink-200">Click a panel to turn it over</span>
          </div>
        </Reveal>

        {/* Six panels, so the column count has to divide six: an auto-fit track
            lands on four at wide viewports and orphans the last two. */}
        <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Reveal y={26}>
            <FlipCard
              id="clock"
              index="01"
              eyebrow="How it works"
              title="The price falls until somebody takes it."
              frontNote="Buying a surface"
              media={<ClockArt />}
              cta={{ href: "/airtime", label: "Take a surface" }}
            >
              <p className="mt-3.5 text-[13.5px] leading-[1.7] text-ink-300">
                No rate card, no sales call, no minimum. Every surface carries its own price clock, and the clock is the whole negotiation. Demand is the only
                thing that raises a price.
              </p>
              <div className="mt-4 flex flex-col">
                {[
                  "Pick a surface — each one has its own price clock.",
                  "Preview your creative on that exact surface. What you preview is what airs.",
                  "Take it at the asking price from your own wallet.",
                  "Hold it until another buyer pays more.",
                ].map((step, i) => (
                  <div key={step} className="flex gap-4 border-t border-white/[0.09] py-[11px] last:border-b">
                    <span className="mono w-[22px] shrink-0 text-[9.5px] tracking-[0.16em] text-signal">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-[13px] leading-normal text-ink-200">{step}</span>
                  </div>
                ))}
              </div>
            </FlipCard>
          </Reveal>

          <Reveal y={26} delay={0.08}>
            <FlipCard
              id="picture"
              index="02"
              eyebrow="The picture"
              title="Whoever holds the screen is the programme."
              frontNote="Taking the picture"
              media={<PictureArt channelId={channelId} />}
              cta={{ href: "/airtime/SHOW", label: "Put on a show" }}
            >
              <p className="mt-3.5 text-[13.5px] leading-[1.7] text-ink-300">
                A show is up to half an hour, uploaded or linked from anywhere. It plays to everyone in the room in sync, from the moment it is bought until
                another buyer pays more for the same screen.
              </p>
              <div className="mono mt-5 flex flex-col text-[10px] uppercase tracking-[0.14em]">
                {[
                  ["Runtime", "Up to 30 minutes"],
                  ["Commercial", "30 seconds, every break"],
                  ["Display panels", "Either side, always on"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3.5 border-t border-white/[0.09] py-3 last:border-b">
                    <span className="text-ink-400">{k}</span>
                    <span className="text-ink-200">{v}</span>
                  </div>
                ))}
              </div>
              <ShowPrice channelId={channelId} />
            </FlipCard>
          </Reveal>

          <Reveal y={26} delay={0.16}>
            <FlipCard
              id="honesty"
              index="03"
              eyebrow="Honesty"
              title="What the chain proves, and what it does not."
              frontNote="Payment vs delivery"
              media={<HonestyArt />}
              cta={{ href: "/docs#content", label: "Read the policy" }}
            >
              <p className="mt-3.5 text-[13.5px] leading-[1.7] text-ink-300">
                The chain proves payment: a specific buyer paid a specific amount for a quote bound to a placement, a price and a hash of the exact creative. The
                browser never decides that something is paid — the server reads the transaction from its own node and re-checks every field against the quote it
                signed.
              </p>
              <p className="mt-3.5 text-[13.5px] leading-[1.7] text-ink-300">
                What it does not prove is delivery. How many sessions had the station open, whether the creative loaded, whether the tab was visible: those are
                application measurements, kept separate and never dressed up as on-chain impressions.
              </p>
              <ProofBlocks channelId={channelId} />
              <p className="mono mt-4 text-[10px] uppercase leading-relaxed tracking-[0.14em] text-ink-500">
                No viewer count on this network is invented. The number in the bar is a count of open station tabs and nothing else.
              </p>
            </FlipCard>
          </Reveal>

          <Reveal y={26} delay={0.24}>
            <FlipCard
              id="treasury"
              index="04"
              eyebrow="Treasury"
              title="Every fee buys Anduril pre-stock."
              frontNote="Where the money goes"
              media={<TreasuryArt />}
              cta={{ href: "/treasury", label: "Open the ledger" }}
            >
              <p className="mt-3.5 text-[13.5px] leading-[1.7] text-ink-300">
                What the network earns is used to buy Anduril pre-stock, which is then distributed to holders. Airtime revenue is derived from payments the
                station verified on chain and can never be typed in by hand.
              </p>
              <p className="mt-3.5 text-[13.5px] leading-[1.7] text-ink-300">
                Token tax, pre-stock purchases and distributions happen off this chain through a broker, so they are recorded by the operator and always labelled
                as recorded figures rather than proven ones.
              </p>
              <LedgerGrid />
              <p className="mt-3.5 text-[11.5px] leading-[1.7] text-ink-500">This is not an offer, a prospectus, or investment advice.</p>
            </FlipCard>
          </Reveal>

          <Reveal y={26} delay={0.32}>
            <FlipCard
              id="room"
              index="05"
              eyebrow="The room"
              title="Everyone watching is in the same room."
              frontNote="Chat and sync"
              media={<RoomArt />}
              cta={{ href: "/watch", label: "Open the room" }}
            >
              <p className="mt-3.5 text-[13.5px] leading-[1.7] text-ink-300">
                Connect a wallet to talk. The wallet is the name, so there is nobody to impersonate, and the room is rate limited rather than moderated into
                silence.
              </p>
              <p className="mt-3.5 text-[13.5px] leading-[1.7] text-ink-300">
                Everyone asks the server for the block playing right now and seeks to the same offset, so whatever one buyer puts on the screen, the whole room
                sees at the same moment.
              </p>
              <div className="mt-5 rounded-lg border border-white/12 bg-black/30 p-4">
                <div className="mono text-[10px] uppercase tracking-[0.18em] text-ink-300">Station chat</div>
                <div className="mt-3 h-[220px]">
                  <StationChat className="h-full" />
                </div>
              </div>
            </FlipCard>
          </Reveal>

          <Reveal y={26} delay={0.4}>
            <FlipCard
              id="about"
              index="06"
              eyebrow="About"
              title="Advertising you can buy from your seat."
              frontNote="Jeff Miller · founder"
              media={<PortraitArt />}
              cta={{ href: "/info", label: "Read the mission" }}
            >
              <p className="mt-3.5 text-[13.5px] leading-[1.7] text-ink-300">
                Television built the largest advertising business in history on a simple idea: a channel has a finite amount of time and space, and anyone can buy
                a piece of it. Buying a spot now means a rate card, a sales call, an agency, an insertion order, and a minimum spend that rules out almost
                everybody.
              </p>
              <p className="mt-3.5 text-[13.5px] leading-[1.7] text-ink-300">
                AIRTIME puts the whole thing back in the open. The station runs around the clock in a browser, the price of every surface is on the screen, and
                anyone with a wallet can take one. No sales call, no minimum, no gatekeeper.
              </p>
              <div className="mt-5 border-l-2 border-signal pl-3.5">
                <div className="text-[15px] font-medium tracking-[-0.025em] text-ink-50">Jeff Miller</div>
                <div className="mono mt-1.5 text-[9.5px] uppercase tracking-[0.16em] text-ink-300">Founder</div>
              </div>
            </FlipCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/**
 * The picture's ask, at the size the design gives it: the number alone, with
 * whoever is holding the screen named beside it.
 */
function ShowPrice({ channelId }: { channelId: string }) {
  const { data } = useBoard(channelId);
  const show = (data?.rows ?? []).find((r) => r.placement.kind === "show");
  const live = useLiveAsk(show?.placement, show?.surface);
  const occupant = show?.surface.occupant ?? null;
  return (
    <div className="mt-5 flex items-end gap-3">
      <span className="mono text-[44px] leading-[0.86] tracking-[-0.04em] text-signal tabular-nums">{live ? formatWei(live.askWei).replace(" ETH", "") : "—"}</span>
      <span className="mono pb-[5px] text-[11px] uppercase tracking-[0.2em] text-ink-300">
        {occupant ? `ETH · to take it from ${occupant.displayName}` : "ETH · nobody is holding it"}
      </span>
    </div>
  );
}

/* ---- closing ------------------------------------------------------------- */

function ClosingCta() {
  return (
    <section className="w-full border-t border-white/[0.08] bg-ink-900">
      <div className="mx-auto max-w-[1560px] px-6 py-[120px]">
        <Reveal y={20}>
          <div className="flex flex-wrap items-end justify-between gap-10">
            <h2 className="max-w-[16ch] flex-[1_1_420px] text-[clamp(32px,4.6vw,64px)] font-medium leading-[0.96] tracking-[-0.05em] text-ink-50 [text-wrap:pretty]">
              The channel is open right now.
            </h2>
            <div className="flex flex-[0_1_auto] flex-wrap items-center gap-3.5">
              <Link
                href="/airtime"
                className="mono inline-flex h-[52px] items-center justify-center whitespace-nowrap rounded-sm bg-signal px-[30px] text-[11.5px] font-semibold uppercase tracking-[0.16em] text-[#0d1400] transition hover:bg-[#d9ff33]"
              >
                Buy airtime
              </Link>
              <span className="mono text-[10px] uppercase tracking-[0.16em] text-ink-400">Four surfaces · opens at 0.01 ETH</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
