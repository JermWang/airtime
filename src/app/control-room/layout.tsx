"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Wordmark } from "@/components/hud/Wordmark";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";

const NAV = [
  { href: "/control-room", label: "Master control" },
  { href: "/control-room/schedule", label: "Programming" },
  { href: "/control-room/placements", label: "Placements" },
  { href: "/control-room/creatives", label: "Moderation" },
  { href: "/control-room/campaigns", label: "Ad queue" },
  { href: "/control-room/payments", label: "Payments" },
  { href: "/control-room/treasury", label: "Treasury" },
  { href: "/control-room/settings", label: "Settings" },
  { href: "/control-room/audit", label: "Audit log" },
];

export default function ControlRoomLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  if (path === "/control-room/login") return <>{children}</>;
  return (
    <div className="flex min-h-dvh bg-ink-950">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-white/10 bg-ink-900/60 p-4 md:flex">
        <Link href="/" className="mb-1">
          <Wordmark size={13} />
        </Link>
        <div className="label mb-6">Control room</div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cn("rounded-md px-2.5 py-1.5 text-[12px] transition", (n.href === "/control-room" ? path === n.href : path.startsWith(n.href)) ? "bg-white/10 text-ink-50" : "text-ink-300 hover:bg-white/5 hover:text-ink-100")}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <Link href="/" className="btn btn-sm">
            Open station
          </Link>
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await api("/api/admin/auth/logout", { method: "POST" });
              router.push("/control-room/login");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 overflow-x-auto border-b border-white/10 px-3 py-2 md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cn("btn btn-ghost btn-sm shrink-0", path === n.href && "bg-white/10")}>
              {n.label}
            </Link>
          ))}
        </div>
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
