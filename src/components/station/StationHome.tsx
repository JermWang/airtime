"use client";

import Link from "next/link";
import { useBroadcastState, useBoard } from "@/lib/hooks";
import { usePlayer } from "./playerStore";
import { StationPlayer } from "./StationPlayer";
import { StatusRail } from "@/components/hud/StatusRail";
import { MobileDock } from "@/components/hud/MobileDock";
import { SiteFooter } from "@/components/hud/SiteFooter";
import { ContentNotice } from "@/components/hud/ContentNotice";
import { SoundBlockedPrompt } from "@/components/hud/SoundControl";
import { StationChat } from "@/components/hud/StationChat";
import { LogoRow } from "@/components/marketing/LogoRow";
import { GlassPortrait } from "@/components/marketing/GlassPortrait";
import { formatWei, cn } from "@/lib/format";
import type { BoardRowDto } from "@/lib/api";

/* -------------------------------------------------------------------------- */
/*  Copy                                                                      */
/* -------------------------------------------------------------------------- */

const STEPS = [
  { n: "01", t: "Pick a surface", d: "The picture itself, or any surface the station is selling. Each one is a row in a database with its own price clock." },
  { n: "02", t: "Preview your creative", d: "Upload an image or a video and see it on that exact surface before you commit. What you preview is what airs." },
  { n: "03", t: "Take it at the asking price", d: "The price walks down on its own until somebody takes it. Pay the number on screen from your own wallet." },
  { n: "04", t: "Hold it until you are outbid", d: "You get a guaranteed minimum of runtime, then you hold the surface until another buyer pays more for it." },
];

const FOUNDER = { name: "Jeff Miller", role: "" };

const MISSION = [
  "Television built the largest advertising business in history on a simple idea: a channel has a finite amount of time and space, and anyone can buy a piece of it. Somewhere along the way that stopped being true. Buying a spot now means a rate card, a sales call, an agency, an insertion order, and a minimum spend that rules out almost everybody.",
  "AIRTIME puts the whole thing back in the open. The station runs around the clock in a browser, the price of every surface is on the screen, and anyone with a wallet can take one. No sales call, no minimum, no gatekeeper.",
  "Every fee the network collects goes toward Anduril pre-stock, which is distributed to holders. Revenue is derived from payments verified on chain and cannot be typed in by hand.",
];

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The station front page.
 *
 * The picture is the splash: it plays full-bleed behind the fold, exactly as it
 * is going out right now, and everything that explains the network is stacked
 * underneath it in full-width slices. There is no 3D room here - the programme
 * is the subject and nothing is drawn over it.
 */
export function StationHome({ channelId = "MAIN" }: { channelId?: string }) {
  return (
    <main className="min-h-dvh bg-ink-950">
      <StatusRail channelId={channelId} />
      <SoundBlockedPrompt />
      <ContentNotice />
      <Hero channelId={channelId} />
      <SurfaceStrip channelId={channelId} />
      <HowItWorks />
      <Proof />
      <Money />
      <ChatSlice />
      <About />
      <div className="py-14">
        <LogoRow label="Runs on" />
      </div>
      <SiteFooter wide />
      <MobileDock />
    </main>
  );
}

/* ---- hero ---------------------------------------------------------------- */

function Hero({ channelId }: { channelId: string }) {
  const { data } = useBroadcastState(channelId);
  const source = usePlayer((s) => s.source);
  const playing = usePlayer((s) => s.playing);
  const block = data?.now;
  const isLive = block?.type === "LIVE_HLS";
  const onAir =
    source?.kind === "campaign-video" || source?.kind === "campaign-image"
      ? `${source.campaign.displayName}${source.slot === "ad" ? " · commercial" : ""}`
      : block?.title ?? "Stand by";

  return (
    <section className="relative h-[100svh] min-h-[560px] w-full overflow-hidden">
      {/* The picture, exactly as it is going out. */}
      <div className="absolute inset-0">
        <StationPlayer channelId={channelId} visible fit="cover" className="h-full w-full" overlays={false} />
      </div>

      {/* Scrims: one under the top bar, one under the copy. Nothing across the
          middle of the frame, so the programme is never veiled. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%] bg-gradient-to-t from-black via-black/85 to-transparent" />
      {/* A soft wash from the left so the headline holds against a bright frame
          without veiling the picture itself. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-full bg-gradient-to-r from-black/75 via-black/25 to-transparent md:w-[70%]" />

      <div className="absolute inset-x-0 bottom-0 px-5 pb-14 md:px-10 md:pb-16">
        <div className="mx-auto max-w-[1400px]">
          <div className="mono flex flex-wrap items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] text-ink-200">
            <span className={cn("chip", isLive ? "chip-live" : playing ? "chip-signal" : "")}>
              {isLive ? <span className="dot-live" /> : <span className={cn("h-1.5 w-1.5 rounded-full", playing ? "bg-signal" : "bg-ink-400")} />}
              {isLive ? "Live" : playing ? "On air" : "Stand by"}
            </span>
            <span className="truncate text-ink-300">{onAir}</span>
          </div>

          <h1 className="mt-5 max-w-[18ch] text-[clamp(34px,7vw,84px)] font-medium leading-[0.95] tracking-[-0.05em] text-ink-50">
            Buy a piece of the channel.
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-200">
            A 24/7 television network in your browser where every display surface is advertising inventory. The price is on the screen, the payment settles on
            chain, and the station verifies it before a single frame airs.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <Link href="/airtime" className="btn btn-primary">
              Buy airtime
            </Link>
            <Link href="/watch" className="btn">
              Watch full screen
            </Link>
            <Link href="/docs" className="btn btn-ghost">
              How it works
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---- inventory strip ----------------------------------------------------- */

/** The row under the fold: what is for sale, and what it costs right now. */
function SurfaceStrip({ channelId }: { channelId: string }) {
  const { data } = useBoard(channelId);
  const rows = (data?.rows ?? []).filter((r) => r.placement.isActive);
  if (!rows.length) return null;
  return (
    <section className="border-y border-white/8 bg-ink-900">
      <div className="mx-auto max-w-[1400px] px-5 py-4 md:px-10">
        <div className="scrollbar-thin flex gap-8 overflow-x-auto md:gap-12">
          {rows.map((r: BoardRowDto) => (
            <Link key={r.placement.id} href={`/airtime/${r.placement.id}`} className="group flex shrink-0 items-baseline gap-3 py-1">
              <span className="mono text-[10px] uppercase tracking-[0.16em] text-ink-400 transition group-hover:text-signal">{r.placement.name}</span>
              <span className="mono text-[12px] tracking-tight text-ink-100">{formatWei(r.surface.askWei)}</span>
              <span className="mono text-[9px] uppercase tracking-[0.14em] text-ink-600">{r.occupant ? "held" : r.surface.forSale ? "open" : "closed"}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---- slices -------------------------------------------------------------- */

function Slice({ children, tone = "base", className }: { children: React.ReactNode; tone?: "base" | "raised"; className?: string }) {
  return (
    <section className={cn("w-full border-b border-white/8", tone === "raised" ? "bg-ink-900" : "bg-ink-950", className)}>
      <div className="mx-auto max-w-[1400px] px-5 py-20 md:px-10 md:py-28">{children}</div>
    </section>
  );
}

function SliceHead({ label, title, lede }: { label: string; title: string; lede?: string }) {
  return (
    <header className="max-w-3xl">
      <div className="eyebrow">{label}</div>
      <h2 className="mt-4 text-[clamp(24px,3.6vw,40px)] font-medium leading-[1.05] tracking-[-0.035em] text-ink-50">{title}</h2>
      {lede && <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-ink-300">{lede}</p>}
    </header>
  );
}

function HowItWorks() {
  return (
    <Slice tone="raised">
      <SliceHead label="How it works" title="Take a surface, put your own creative on it, hold it until somebody pays more." />
      <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 md:grid-cols-4">
        {STEPS.map((s) => (
          <li key={s.n} className="bg-ink-900 p-6">
            <div className="step-index">{s.n}</div>
            <div className="mt-3 text-[15.5px] font-medium tracking-tight text-ink-50">{s.t}</div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-300">{s.d}</p>
          </li>
        ))}
      </ol>
    </Slice>
  );
}

function Proof() {
  return (
    <Slice>
      <SliceHead
        label="Honesty"
        title="What the chain proves, and what it does not."
        lede="Payment facts and delivery numbers come from different places, so they are never mixed together."
      />
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="card p-6">
          <div className="label-strong">Payment facts · on chain</div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-300">
            A specific buyer paid a specific amount for a quote bound to a placement, a price and a hash of the exact creative. The browser never decides that
            something is paid: the server reads the transaction from its own node and re-checks every field against the quote it signed.
          </p>
        </div>
        <div className="card p-6">
          <div className="label-strong">Delivery numbers · application</div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-300">
            How many sessions had the station open, whether the creative loaded, whether the tab was visible, completions and clicks. First-party analytics,
            always shown separately from the payment, never dressed up as on-chain impressions.
          </p>
        </div>
      </div>
      <p className="mt-6 max-w-3xl text-[13.5px] leading-relaxed text-ink-400">
        No viewer counts are invented anywhere in this product. Programming is unrated: everything in station time is a user submission that was paid for, and no
        content rating or viewer discretion warning is applied to any of it.
      </p>
    </Slice>
  );
}

function Money() {
  return (
    <Slice tone="raised">
      <div className="grid gap-10 md:grid-cols-[1.1fr_1fr] md:gap-16">
        <div>
          <SliceHead label="Treasury" title="Every fee buys Anduril pre-stock." />
          <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-ink-300">
            What the network earns is used to buy Anduril pre-stock, which is then distributed to holders. Airtime revenue is derived from payments the station
            verified on chain and can never be typed in by hand. Token tax, pre-stock purchases and distributions happen off this chain through a broker, so they
            are recorded by the operator and always labelled as recorded figures rather than proven ones.
          </p>
          <Link href="/treasury" className="btn btn-sm mt-7">
            Open the treasury
          </Link>
        </div>
        <div className="card p-6">
          <div className="label-strong">Creative rules</div>
          <ul className="mt-4 flex flex-col gap-2.5 text-[13.5px] leading-relaxed text-ink-300">
            <li>Images and MP4 video only. No advertiser HTML, JavaScript or iframes, anywhere.</li>
            <li>Uploads are typed from their magic bytes, decoded, re-encoded and re-hashed on the server.</li>
            <li>The creative that airs is the one whose hash was signed into the quote.</li>
            <li>Some surfaces need a moderator to approve the creative before it can be quoted.</li>
          </ul>
        </div>
      </div>
    </Slice>
  );
}

function ChatSlice() {
  return (
    <Slice>
      <div className="grid gap-10 md:grid-cols-[1fr_460px] md:gap-16">
        <div>
          <SliceHead
            label="The room"
            title="Everyone watching is in the same room."
            lede="Connect a wallet to talk. The wallet is the name, so there is nobody to impersonate, and the room is rate limited rather than moderated into silence."
          />
        </div>
        <div className="card flex h-[420px] flex-col p-4">
          <StationChat className="h-full" />
        </div>
      </div>
    </Slice>
  );
}

function About() {
  return (
    <Slice tone="raised">
      <div className="grid items-center gap-12 md:grid-cols-[300px_minmax(0,1fr)] md:gap-16">
        <div className="flex justify-center md:justify-start">
          <GlassPortrait src="/team/jeff-miller.webp" alt={FOUNDER.role ? `${FOUNDER.name}, ${FOUNDER.role}` : FOUNDER.name} size={280} />
        </div>
        <div>
          <SliceHead label="About us" title="Advertising should be something you can buy from your seat." />
          <div className="mt-6 flex flex-col gap-4">
            {MISSION.map((p) => (
              <p key={p.slice(0, 24)} className="max-w-2xl text-[13.5px] leading-relaxed text-ink-300">
                {p}
              </p>
            ))}
          </div>
          <div className="mt-7 border-l border-signal/50 pl-4">
            <div className="text-[14px] font-medium tracking-tight text-ink-50">{FOUNDER.name}</div>
            {FOUNDER.role && <div className="mono mt-1 text-[10px] uppercase tracking-[0.16em] text-ink-400">{FOUNDER.role}</div>}
          </div>
        </div>
      </div>
    </Slice>
  );
}

