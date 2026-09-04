"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PageFrame } from "@/components/hud/PageFrame";
import { LogoRow } from "@/components/marketing/LogoRow";

const REPO = "https://github.com/JermWang/airtime";

const SECTIONS = [
  { id: "quickstart", title: "Buy your first spot" },
  { id: "inventory", title: "The inventory model" },
  { id: "pricing", title: "How a price is calculated" },
  { id: "creatives", title: "Creative specifications" },
  { id: "content", title: "Content policy and ratings" },
  { id: "payments", title: "Payment and verification" },
  { id: "receipts", title: "Receipts and delivery" },
  { id: "operating", title: "Operating the station" },
  { id: "local", title: "Running it locally" },
  { id: "security", title: "Security model" },
  { id: "api", title: "Routes and API" },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/8 pt-10 first:border-0 first:pt-0">
      <h2 className="section-title">{title}</h2>
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="body-copy max-w-3xl">{children}</p>;
}

function C({ children }: { children: ReactNode }) {
  return <code className="inline">{children}</code>;
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="body-copy flex max-w-3xl list-none flex-col gap-2.5">
      {items.map((it, i) => (
        <li key={i} className="relative pl-4 text-ink-300">
          <span className="absolute left-0 top-[0.62em] h-[3px] w-[3px] rounded-full bg-signal" />
          {it}
        </li>
      ))}
    </ul>
  );
}

/** Public documentation: how to buy airtime, and how the station behaves. */
export default function DocsPage() {
  return (
    <PageFrame wide>
      <div className="pt-4 md:pt-8">
        <div className="eyebrow">Documentation</div>
        <h1 className="display mt-4 max-w-3xl">How the network works</h1>
        <p className="lede mt-5 max-w-2xl">
          Everything an advertiser or an operator needs: what can be bought, how it is priced, what happens to a payment, and what the station promises about the
          numbers it shows. The full engineering write-up lives in the{" "}
          <a href={REPO} target="_blank" rel="noreferrer noopener" className="text-signal underline-offset-4 hover:underline">
            repository README
          </a>
          .
        </p>
      </div>

      <div className="mt-12 grid gap-12 md:grid-cols-[210px_minmax(0,1fr)] md:gap-14">
        {/* ---- table of contents ---------------------------------------- */}
        <nav aria-label="On this page" className="hidden md:block">
          <div className="sticky top-24">
            <div className="label mb-3">On this page</div>
            <ul className="flex flex-col gap-1.5 border-l border-white/10">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-0.5 pl-3 text-[12px] text-ink-400 transition hover:border-signal hover:text-ink-100">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* ---- body ------------------------------------------------------ */}
        <div className="flex min-w-0 flex-col gap-10">
          <Section id="quickstart" title="Buy your first spot">
            <P>
              Nothing has to be installed and no account is created with a password. A wallet on Robinhood Chain is all that is required.
            </P>
            <ol className="body-copy flex max-w-3xl flex-col gap-3">
              {[
                <>Open the station and press <strong className="text-ink-50">Buy airtime</strong>. Every surface that can be bought lights up.</>,
                <>Click a surface, or pick one from <Link href="/airtime" className="text-signal hover:underline">the inventory list</Link>.</>,
                <>Connect a wallet and sign in. Sign-in is a signature, not a password, and the nonce is single use.</>,
                <>Upload an image or video. It is validated on the server and rendered onto that exact surface so you can see it before paying.</>,
                <>Read the asking price. It descends on its own clock, so waiting costs you nothing but risks somebody else taking the surface first.</>,
                <>Take the surface at that price. The server signs a quote for it and holds the ask while you pay.</>,
                <>Send the payment. The station verifies the on-chain event itself, then puts your creative up.</>,
                <>Hold the surface until somebody pays more, and keep the AirLog receipt when the run ends.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3.5">
                  <span className="step-index mt-[3px] shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-ink-300">{step}</span>
                </li>
              ))}
            </ol>
          </Section>

          <Section id="inventory" title="The inventory model">
            <P>
              No placement, price or surface is hardcoded anywhere in the interface. A placement is a database row, and the studio renders whatever rows exist. An
              operator can point a placement at any named mesh in the studio model and it becomes buyable immediately, with no code change and no deploy.
            </P>
            <div className="overflow-x-auto">
              <table className="data min-w-[620px]">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>What it is</th>
                    <th>Behaviour</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="text-ink-50">FULLSCREEN</td>
                    <td>A commercial in the break</td>
                    <td>Replaces the main picture for its duration</td>
                  </tr>
                  <tr>
                    <td className="text-ink-50">OVERLAY</td>
                    <td>Lower third, LED ticker, sponsor bug</td>
                    <td>Drawn over the programme without interrupting it</td>
                  </tr>
                  <tr>
                    <td className="text-ink-50">ENVIRONMENT</td>
                    <td>A display inside the studio</td>
                    <td>On screen whenever the room is on screen</td>
                  </tr>
                  <tr>
                    <td className="text-ink-50">SPONSORSHIP</td>
                    <td>Station identification bumper</td>
                    <td>Attaches to a recurring piece of the schedule</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Bullets
              items={[
                <>
                  <C>lane</C> is the exclusivity group, so surfaces that must never carry two advertisers at once share one.
                </>,
                <>
                  <C>ownsMainStream</C> decides whether an airing campaign takes over the main picture. That single column is what makes commercials, takeovers and
                  sponsored bumpers work without special cases.
                </>,
                <>
                  <C>inventoryMode</C> is either <C>CONTINUOUS</C>, meaning the surface is live whenever the station is, or <C>AD_BREAK</C>, meaning it only plays
                  inside a commercial break.
                </>,
                <>
                  <C>auction</C> carries the surface&apos;s own price clock: opening price, floor, how long the descent takes, the takeover premium, the minimum
                  increment and the guaranteed hold.
                </>,
              ]}
            />
          </Section>

          <Section id="pricing" title="How a price is calculated">
            <P>
              Nobody buys a thirty-second spot here. A buyer takes a surface at the price it is asking right now and stays on it until somebody pays more, so each
              surface is a single descending price clock.
            </P>
            <Bullets
              items={[
                <>A surface nobody has bought asks its opening price and walks down toward its floor. The first buyer who thinks the current number is fair takes it.</>,
                <>A sale resets the clock. The ask jumps to a premium over what the buyer paid and starts descending again.</>,
                <>While a surface is occupied the ask can never fall below what the occupant paid plus the minimum increment, so a takeover is always a strictly higher bid.</>,
                <>For the first stretch of a run the surface is not for sale at all, so a buyer always gets the runtime they paid for.</>,
                <>When a run ends the clock resets from the last clearing price down to the floor, so an unwanted surface gets cheaper until somebody wants it.</>,
              ]}
            />
            <P>
              The descent is linear, so anyone reading the placement row can reproduce it exactly: the ask is the anchor minus the anchor-to-floor distance times
              the elapsed fraction of the decay. Money is integer wei end to end and every multiplier is integer basis points, so no rounding drift is possible.
            </P>
            <P>
              The server is the only thing that prices anything. The browser asks for a quote and receives a signed one back; it never computes a number that is
              trusted later.
            </P>
          </Section>

          <Section id="creatives" title="Creative specifications">
            <P>Advertiser content is treated as hostile input, because it is.</P>
            <Bullets
              items={[
                <>Accepted: still images, and MP4 video in H.264 or AV1. Text creatives are accepted where a placement allows them.</>,
                <>
                  Never accepted: HTML, JavaScript, iframes. There is no code path anywhere in this product that renders advertiser markup.
                </>,
                <>The real type is sniffed from the file&apos;s magic bytes. The browser&apos;s declared MIME type and the file extension are not trusted.</>,
                <>Images are decoded and re-encoded on the server, which strips metadata and any embedded payload, then downscaled to the placement maximum.</>,
                <>Video is parsed for true duration, dimensions, codec and audio track presence before it is accepted.</>,
                <>Each placement carries its own limits: aspect ratio, maximum dimensions, maximum file size, whether audio is allowed and whether a click-through is allowed.</>,
              ]}
            />
            <P>
              The hash of the re-encoded file is what gets signed into the quote and emitted on chain, so the creative that airs is provably the one that was paid
              for.
            </P>
          </Section>

          <Section id="content" title="Content policy and ratings">
            <P>
              <strong className="text-ink-50">This network is unrated.</strong> There is no TV rating system here, no age gate, and no viewer discretion advisory
              shown before anything plays. Nothing you see carries a classification of any kind.
            </P>
            <P>
              Everything that runs during station time is a user submission that was paid for. A buyer takes a surface, supplies their own creative and it is shown
              as supplied. AIRTIME does not produce that material and does not endorse it.
            </P>
            <Bullets
              items={[
                <>Placements that carry <C>requiresModeration</C> are checked by a moderator against the network&apos;s rules before they can air. That is a policy check, not a rating, and it is not a judgement about who the material is suitable for.</>,
                <>Surfaces without that flag air as soon as the payment verifies, with no human in the loop.</>,
                <>House graphics and the example cards on unsold surfaces are the station&apos;s own, always badged EXAMPLE, and are never presented as paid campaigns.</>,
                <>Operators can end a run from master control. Every such action is written to the audit log.</>,
              ]}
            />
            <P>Watch at your own discretion. If something breaks the rules, report it from the campaign page or the source repository.</P>
          </Section>

          <Section id="payments" title="Payment and verification">
            <P>The browser never decides that something is paid.</P>
            <ol className="body-copy flex max-w-3xl flex-col gap-3">
              {[
                <>
                  The server signs an EIP-712 quote binding the quote id, buyer, placement, creative hash, amount, expiry and nonce. The domain separator includes
                  the chain id and contract address, so a quote cannot be replayed on another chain or deployment.
                </>,
                <>
                  The payment contract re-checks the signature, caller, expiry, quote id, buyer nonce, token and exact amount, marks the quote consumed, forwards
                  the funds to the treasury and emits its purchase event.
                </>,
                <>
                  The browser may hint a transaction hash, but it is only ever a lookup key. The server fetches the receipt from its own node, finds the event
                  emitted by the configured contract address, and re-checks every field against the quote it signed.
                </>,
                <>
                  The same check also runs from the scheduler every few seconds with no browser involved, so closing the tab cannot lose a payment.
                </>,
                <>Only then does the buyer take the surface: the previous occupant&apos;s run ends, the new creative goes up and the price clock resets.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3.5">
                  <span className="step-index mt-[3px] shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-ink-300">{step}</span>
                </li>
              ))}
            </ol>
            <P>A pending transaction is never treated as paid, and unique indexes on the payments table make double-recording impossible.</P>
          </Section>

          <Section id="receipts" title="Receipts and delivery">
            <P>
              Every completed campaign gets an AirLog: a shareable page showing what aired, on which surface, for which seconds, and the payment that bought it.
              Payment facts come from the chain. Delivery numbers come from AIRTIME&apos;s own first-party analytics, which store only a daily-salted hash of a
              per-tab random id, with no cookies and no cross-day joins.
            </P>
            <P>
              The two are always presented separately. Nothing in this product describes an application-side delivery number as a verified or on-chain impression,
              and no viewer count is ever invented.
            </P>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/queue" className="btn btn-sm">
                Public broadcast log
              </Link>
              <Link href="/guide" className="btn btn-sm">
                Program guide
              </Link>
              <Link href="/treasury" className="btn btn-sm">
                Treasury
              </Link>
            </div>
          </Section>

          <Section id="operating" title="Operating the station">
            <P>
              Master control lives at <C>/control-room</C> and is authenticated. From there an operator schedules programming, creates and edits placements
              including picking their mesh in the live studio, moderates creatives, reviews payments and reads the audit log. Every administrative mutation is
              written to an audit table with actor, action, target and details.
            </P>
            <P>
              A new placement can also be added in code by appending to <C>BASE_PLACEMENTS</C> in the seed. Either way the studio picks it up over the realtime bus
              and it becomes buyable without a restart.
            </P>
          </Section>

          <Section id="local" title="Running it locally">
            <pre className="block max-w-3xl">{`pnpm dev                 # station on :3000, embedded database, seeded
pnpm studio:build        # regenerate the studio model
pnpm chain:local         # local chain
pnpm contract:build && pnpm contract:deploy:local
pnpm test                # unit and API integration
pnpm contract:test       # contract tests
pnpm test:e2e            # full purchase path in a real browser`}</pre>
            <P>
              The end-to-end suite deploys the payment contract to a fresh chain, builds and starts the production server, then drives a browser all the way
              through: open a billboard, sign in, upload a creative, preview it, take a quote, pay, verify, air it and render the receipt.
            </P>
          </Section>

          <Section id="security" title="Security model">
            <Bullets
              items={[
                <>A strict content security policy with a per-request nonce. Creatives are served sandboxed, with no sniffing allowed.</>,
                <>Advertisers authenticate by wallet signature with single-use, expiring nonces. Operators use a password with a separate session.</>,
                <>Uploads need a short-lived ticket bound to the wallet and the placement, on top of the session.</>,
                <>All API input is schema-validated. State-changing endpoints check same-origin and are rate limited.</>,
                <>The quote signer key holds no funds, never reaches the browser, and the treasury is a separate address configured on the contract.</>,
              ]}
            />
          </Section>

          <Section id="api" title="Routes and API">
            <div className="overflow-x-auto">
              <table className="data min-w-[560px]">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["/", "The station: studio, live television and purchase"],
                    ["/watch", "2D station with guide and log, no WebGL needed"],
                    ["/guide", "Program guide"],
                    ["/queue", "Public broadcast log"],
                    ["/airtime", "All inventory, plus your campaigns"],
                    ["/campaign/[id]", "Campaign status, creative hash and payment"],
                    ["/airlog/[id]", "Shareable proof-of-air receipt"],
                    ["/treasury", "Income in, pre-stock bought and distributed"],
                    ["/control-room", "Master control, authenticated"],
                  ].map(([route, purpose]) => (
                    <tr key={route}>
                      <td className="mono text-ink-50">{route}</td>
                      <td>{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <P>
              Public read APIs include the server clock, the realtime event stream, broadcast state and guide, the queue, activations, placements and their
              availability, showcase cards, treasury and AirLog. The full list, along with environment variables and deployment notes, is in the{" "}
              <a href={REPO} target="_blank" rel="noreferrer noopener" className="text-signal underline-offset-4 hover:underline">
                README
              </a>
              .
            </P>
          </Section>
        </div>
      </div>

      <div className="-mx-4 mt-16">
        <LogoRow label="Runs on" />
      </div>
    </PageFrame>
  );
}
