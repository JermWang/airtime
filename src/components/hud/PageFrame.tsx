"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";
import { WalletButton } from "./WalletButton";
import { MobileDock } from "./MobileDock";
import { cn } from "@/lib/format";

const NAV = [
  { href: "/", label: "Station" },
  { href: "/guide", label: "Guide" },
  { href: "/queue", label: "Broadcast log" },
  { href: "/airtime", label: "Inventory" },
  { href: "/treasury", label: "Treasury" },
];

/** Chrome for the non-immersive routes: quiet header, wallet, mobile dock, disclosure. */
export function PageFrame({ children, title, wide = false }: { children: React.ReactNode; title?: string; wide?: boolean }) {
  const path = usePathname();
  return (
    <div className="min-h-dvh bg-ink-950 pb-24 md:pb-10">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-ink-950/80 backdrop-blur-md">
        <div className={cn("mx-auto flex h-14 items-center justify-between px-4", wide ? "max-w-[1400px]" : "max-w-5xl")}>
          <div className="flex items-center gap-5">
            <Link href="/">
              <Wordmark size={14} />
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className={cn("btn btn-ghost btn-sm", (n.href === "/" ? path === "/" : path.startsWith(n.href)) && "bg-white/10")}>
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <WalletButton />
        </div>
      </header>
      <main className={cn("mx-auto px-4 py-6", wide ? "max-w-[1400px]" : "max-w-5xl")}>
        {title && <h1 className="mb-5 text-[22px] font-medium tracking-tight text-ink-50">{title}</h1>}
        {children}
      </main>
      <footer className={cn("mx-auto px-4 pt-8", wide ? "max-w-[1400px]" : "max-w-5xl")}>
        <div className="mono text-[9.5px] uppercase tracking-[0.16em] text-ink-500">Built on Robinhood Chain · AIRTIME is an independent product and is not affiliated with, endorsed by, or operated by Robinhood.</div>
      </footer>
      <MobileDock />
    </div>
  );
}
