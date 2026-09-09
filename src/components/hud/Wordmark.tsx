import { cn } from "@/lib/format";

/**
 * Supplied AIRTIME brand mark paired with the station name.
 */
export function Wordmark({ size = 16, className, muted = false }: { size?: number; className?: string; muted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-[0.45em] select-none", className)} style={{ fontSize: size }} aria-label="AIRTIME">
      <span aria-hidden className={cn("relative inline-block shrink-0 overflow-hidden mix-blend-screen", muted && "opacity-60")}
        style={{ width: size * 1.5, height: size * 1.2 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="" width={1280} height={960}
          className="absolute h-auto max-w-none"
          style={{ width: size * 3.2, left: -size * 0.85, top: -size * 0.6 }} />
      </span>
      <span className="font-sans font-semibold uppercase leading-none tracking-[0.22em] text-ink-50" style={{ fontSize: size * 0.82 }}>
        Airtime
      </span>
    </span>
  );
}
