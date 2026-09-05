"use client";

import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { CONTENT_NOTICE_SHORT } from "./ContentNotice";
import { TokenContractChip } from "./AddressChip";
import { cn } from "@/lib/format";

const REPO = "https://github.com/JermWang/airtime";

/**
 * Site footer.
 *
 * Every link here points at a route this app actually serves, or at the source
 * repository. Nothing is aspirational: if a page does not exist yet it does not
 * get a link.
 */
const COLUMNS: Array<{ heading: string; links: Array<{ href: string; label: string; external?: boolean }> }> = [
  {
    heading: "Watch",
    links: [
      { href: "/", label: "The station" },
      { href: "/watch", label: "2D station" },
      { href: "/guide", label: "Program guide" },
      { href: "/queue", label: "Broadcast log" },
    ],
  },
  {
    heading: "Advertise",
    links: [
      { href: "/airtime", label: "Buy airtime" },
      { href: "/info", label: "How it works" },
      { href: "/docs", label: "Documentation" },
      { href: "/docs#creatives", label: "Creative specs" },
    ],
  },
  {
    heading: "Network",
    links: [
      { href: "/treasury", label: "Treasury" },
      { href: "/docs#content", label: "Content policy" },
      { href: "/docs#payments", label: "How payment works" },
      { href: "/control-room", label: "Master control" },
    ],
  },
  {
    heading: "Build",
    links: [
      { href: REPO, label: "Source code", external: true },
      { href: `${REPO}#readme`, label: "Architecture", external: true },
      { href: `${REPO}/issues`, label: "Report an issue", external: true },
      { href: "/docs#api", label: "Routes and API" },
    ],
  },
];

export function SiteFooter({ wide = false }: { wide?: boolean }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 border-t border-white/8">
      <div className={cn("mx-auto px-4 py-12", wide ? "max-w-[1400px]" : "max-w-5xl")}>
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))] md:gap-8">
          <div className="max-w-xs">
            <Wordmark size={16} />
            <p className="body-copy mt-4 text-ink-300">
              A browser-native television network where every display surface is programmable advertising inventory, settled on Robinhood Chain.
            </p>
            <Link href="/airtime" className="btn btn-primary btn-sm mt-5">
              Buy airtime
            </Link>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <div className="label mb-3.5">{col.heading}</div>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    {l.external ? (
                      <a href={l.href} target="_blank" rel="noreferrer noopener" className="text-[12.5px] text-ink-300 transition hover:text-signal">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="text-[12.5px] text-ink-300 transition hover:text-signal">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 border-t border-white/8 pt-6">
          <p className="body-copy max-w-3xl text-ink-400">{CONTENT_NOTICE_SHORT}</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <TokenContractChip />
              <div className="mono text-[9.5px] uppercase tracking-[0.16em] text-ink-500">© {year} AIRTIME · Built on Robinhood Chain</div>
            </div>
            <div className="mono text-[9.5px] uppercase tracking-[0.16em] text-ink-500">
              Payment facts come from the chain · delivery numbers come from first-party analytics
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
