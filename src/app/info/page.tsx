"use client";

import Link from "next/link";
import { PageFrame } from "@/components/hud/PageFrame";
import { LogoRow } from "@/components/marketing/LogoRow";
import { GlassPortrait } from "@/components/marketing/GlassPortrait";
import { useBoard } from "@/lib/hooks";
import { formatWei } from "@/lib/format";
import type { BoardRowDto, PlacementDto } from "@/lib/api";

const TYPE_LABEL: Record<PlacementDto["type"], string> = {
  FULLSCREEN: "Full screen",
  OVERLAY: "Overlay",
  ENVIRONMENT: "3D studio",
  SPONSORSHIP: "Sponsorship",
};

const TYPE_BLURB: Record<PlacementDto["type"], string> = {
  FULLSCREEN: "Takes over the main picture during a commercial break, exactly like a television spot.",
  OVERLAY: "Sits on top of the programme: lower thirds, the LED ticker, a sponsor bug in the corner.",
  ENVIRONMENT: "A panel beside the picture. It is on screen the whole time the station is, not only during commercial breaks.",
  SPONSORSHIP: "Attaches your name to a piece of the schedule, such as the station identification bumper.",
};

/**
 * Who is behind the station. Edit this rather than the markup below. The role
 * line is rendered only when it is filled in.
 */
const FOUNDER = { name: "Jeff Miller", role: "" };

const MISSION_TITLE = "Advertising should be something you can buy from your seat.";

const MISSION = [
  "Television built the largest advertising business in history on a simple idea: a channel has a finite amount of time and space, and anyone can buy a piece of it. Somewhere along the way that stopped being true. Buying a spot now means a rate card, a sales call, an agency, an insertion order, and a minimum spend that rules out almost everybody.",
  "AIRTIME puts the whole thing back in the open. The station runs around the clock in a browser. Every surface in it, starting with the picture itself, is inventory with a price on the screen. You can see what a surface costs, see your own creative on it before you commit, take it with a wallet, and watch it go up. No sales call, no minimum, no gatekeeper.",
  "The price is not negotiated behind a door either. Each surface runs its own clock that walks the price down until somebody thinks it is worth taking, and taking it from the current holder always costs more than they paid. That is the entire rate card, and anyone can reproduce it from the numbers on the placement.",
  "The last part is what the network does with the money. Every fee it collects goes toward Anduril pre-stock, which is distributed to holders. Revenue is derived from payments verified on chain and cannot be typed in by hand, and every figure that is recorded by an operator instead of proven by the chain is labelled that way.",
];

const STEPS = [
  { n: "01", t: "Pick a surface", d: "Click any lit surface in the studio, or work from the board. Every surface is a row in a database with its own price clock." },
  { n: "02", t: "Preview your own creative", d: "Upload an image or video and see it on that exact surface, in the room, before you pay. What you preview is what airs." },
  { n: "03", t: "Take it at the asking price", d: "Each surface asks a price that walks down over time. Pay the number on screen from your own wallet and the surface is yours." },
  { n: "04", t: "Hold it until someone pays more", d: "You keep the surface for a guaranteed minimum, then hold it until another buyer pays a strictly higher price to take it over." },
];

/** The public explainer: what this network is, and how buying a piece of it works. */
export default function InfoPage() {
  const { data } = useBoard("MAIN");
  const rows = (data?.rows ?? []).filter((r) => r.placement.isActive);
  const groups = new Map<PlacementDto["type"], BoardRowDto[]>();
  for (const r of rows) groups.set(r.placement.type, [...(groups.get(r.placement.type) ?? []), r]);

  return (
    <PageFrame wide>
      {/* ---- hero -------------------------------------------------------- */}
      <section className="pt-4 md:pt-10">
        <div className="eyebrow">A television network you can buy a piece of</div>
        <h1 className="display mt-4 max-w-4xl">
          Every display surface on this station is advertising inventory.
        </h1>
        <p className="lede mt-6 max-w-2xl">
          AIRTIME is a browser-native, 24/7 linear television network. It runs on a real schedule with real commercial breaks, in a screening room built around
          one picture. The picture itself, the ticker under it, the panel either side, the lower third and the sponsor bug: each one is inventory that anyone can
          price, preview and buy. Payment settles on Robinhood Chain, and the station verifies it independently before a single frame airs.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-2.5">
          <Link href="/" className="btn btn-primary">
            Watch the station
          </Link>
          <Link href="/airtime" className="btn">
            Browse inventory
          </Link>
          <Link href="/docs" className="btn btn-ghost">
            Read the docs
          </Link>
        </div>
      </section>

      <hr className="rule my-12 md:my-16" />

      {/* ---- how it works ------------------------------------------------ */}
      <section>
        <h2 className="section-title">How buying airtime works</h2>
        <ol className="mt-7 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 md:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="bg-ink-950 p-5">
              <div className="step-index">{s.n}</div>
              <div className="mt-3 text-[15px] font-medium tracking-tight text-ink-50">{s.t}</div>
              <p className="body-copy mt-2 text-ink-300">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <hr className="rule my-12 md:my-16" />

      {/* ---- inventory --------------------------------------------------- */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="section-title">What is for sale</h2>
            <p className="body-copy mt-2 max-w-2xl">
              Read live from the station, not written into this page. {rows.length ? `${rows.length} surfaces are on the board right now.` : ""} Each asking price
              walks down on its own clock until somebody takes it, then resets above what that buyer paid.
            </p>
          </div>
          <Link href="/airtime" className="btn btn-sm">
            All inventory
          </Link>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {[...groups.entries()].map(([type, list]) => (
            <div key={type} className="card p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-medium tracking-tight text-ink-50">{TYPE_LABEL[type]}</h3>
                <span className="mono text-[10px] uppercase tracking-[0.14em] text-ink-500">{list.length} surfaces</span>
              </div>
              <p className="body-copy mt-1.5 text-ink-300">{TYPE_BLURB[type]}</p>
              <ul className="mt-4 flex flex-col divide-y divide-white/5 border-t border-white/5">
                {list.map(({ placement: p, surface, occupant }) => (
                  <li key={p.id}>
                    <Link href={`/airtime/${p.id}`} className="flex items-center gap-3 py-2.5 transition hover:bg-white/[0.03]">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink-100">{p.name}</span>
                        <span className="mono block truncate text-[10px] uppercase tracking-[0.12em] text-ink-500">
                          {p.aspectRatio} · {p.mediaTypes.join("/")} · {occupant ? `held by ${occupant.displayName}` : surface.forSale ? "open" : "not for sale"}
                        </span>
                      </span>
                      <span className="mono shrink-0 text-right text-[10px] tracking-[0.08em] text-ink-200">
                        <span className="block">{formatWei(surface.askWei)}</span>
                        <span className="block text-ink-500">asking now</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!data && <div className="label">Loading inventory…</div>}
        </div>
      </section>

      <hr className="rule my-12 md:my-16" />

      {/* ---- honesty ----------------------------------------------------- */}
      <section>
        <h2 className="section-title">What the chain proves, and what it does not</h2>
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <div className="label-strong">Payment facts · on chain</div>
            <p className="body-copy mt-3">
              A specific buyer paid a specific amount for a quote bound to a placement, a price and a hash of the exact creative. The browser never decides
              that something is paid: the server reads the payment event from its own node and re-checks every field against the quote it signed.
            </p>
          </div>
          <div className="card p-5">
            <div className="label-strong">Delivery numbers · application</div>
            <p className="body-copy mt-3">
              How many sessions had the station open, whether the creative loaded, whether the tab was visible, completions and clicks. These come from AIRTIME&apos;s
              own first-party analytics, are always shown separately from the payment, and are never dressed up as on-chain impressions.
            </p>
          </div>
        </div>
        <p className="body-copy mt-5 max-w-3xl text-ink-300">
          No viewer counts are invented anywhere in this product. Unsold surfaces carry the station&apos;s own house graphics or example cards that are permanently
          badged EXAMPLE, excluded from the queue and excluded from revenue.
        </p>
      </section>

      <hr className="rule my-12 md:my-16" />

      {/* ---- money ------------------------------------------------------- */}
      <section className="grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-start">
        <div>
          <h2 className="section-title">Where the money goes</h2>
          <p className="body-copy mt-4 max-w-2xl">
            What the network earns is used to buy Anduril pre-stock, which is then distributed to holders. Airtime revenue is derived from payments the station
            verified on chain and can never be typed in by hand. Token tax, pre-stock purchases and distributions happen off this chain through a broker, so they
            are recorded by the operator and always labelled as recorded figures rather than proven ones.
          </p>
          <Link href="/treasury" className="btn btn-sm mt-6">
            Open the treasury
          </Link>
        </div>
        <div className="card p-5">
          <div className="label-strong">Creative rules</div>
          <ul className="body-copy mt-3 flex flex-col gap-2 text-ink-300">
            <li>Images and MP4 video only. There is no code path that renders advertiser HTML, JavaScript or iframes.</li>
            <li>Uploads are typed from their magic bytes, decoded, re-encoded and re-hashed on the server.</li>
            <li>The creative that airs is the one whose hash was signed into the quote and emitted on chain.</li>
            <li>Some placements require a moderator to approve the creative before it can be quoted.</li>
          </ul>
        </div>
      </section>

      <hr className="rule my-12 md:my-16" />

      <hr className="rule my-12 md:my-16" />

      {/* ---- who is behind it -------------------------------------------- */}
      <section className="grid items-center gap-10 md:grid-cols-[320px_minmax(0,1fr)] md:gap-14">
        <div className="flex justify-center md:justify-start">
          <GlassPortrait src="/team/jeff-miller.webp" alt={FOUNDER.role ? `${FOUNDER.name}, ${FOUNDER.role}` : FOUNDER.name} size={300} />
        </div>
        <div>
          <div className="eyebrow">About us</div>
          <h2 className="section-title mt-3">{MISSION_TITLE}</h2>
          <div className="mt-5 flex flex-col gap-4">
            {MISSION.map((para) => (
              <p key={para.slice(0, 24)} className="body-copy max-w-2xl">
                {para}
              </p>
            ))}
          </div>
          <div className="mt-6 border-l border-signal/50 pl-4">
            <div className="text-[14px] font-medium tracking-tight text-ink-50">{FOUNDER.name}</div>
            {FOUNDER.role && <div className="mono mt-1 text-[10px] uppercase tracking-[0.16em] text-ink-400">{FOUNDER.role}</div>}
          </div>
        </div>
      </section>

      {/* ---- logo row ---------------------------------------------------- */}
      <div className="-mx-4">
        <LogoRow label="Runs on" />
      </div>

      <p className="body-copy mx-auto mt-14 max-w-2xl text-center text-ink-400">
        AIRTIME is an independent product. It is not affiliated with, endorsed by, or operated by Robinhood or Anduril. Robinhood Chain is used as payment
        infrastructure.
      </p>
    </PageFrame>
  );
}
