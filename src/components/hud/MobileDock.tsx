"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";

const ITEMS = [
  { href: "/", label: "Watch" },
  { href: "/guide", label: "Guide" },
  { href: "/queue", label: "Queue" },
  { href: "/airtime", label: "Airtime" },
];

/** Mobile bottom navigation. */
export function MobileDock() {
  const path = usePathname();
  return (
    <nav className="glass-strong fixed inset-x-3 z-40 flex items-stretch rounded-xl md:hidden" style={{ bottom: "calc(12px + var(--safe-bottom))" }} aria-label="Primary">
      {ITEMS.map((it) => {
        const active = it.href === "/" ? path === "/" || path === "/watch" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={cn("mono flex flex-1 items-center justify-center py-3 text-[10px] uppercase tracking-[0.18em] transition", active ? "text-signal" : "text-ink-300")}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
