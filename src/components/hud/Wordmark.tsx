import { cn } from "@/lib/format";

/**
 * AIRTIME wordmark: a signal bar (the broadcast "carrier") followed by tight
 * uppercase type. Original, minimal, renders crisply at any size.
 */
export function Wordmark({ size = 16, className, muted = false }: { size?: number; className?: string; muted?: boolean }) {
  const bar = Math.max(2, Math.round(size * 0.16));
  return (
    <span className={cn("inline-flex items-center gap-[0.45em] select-none", className)} style={{ fontSize: size }} aria-label="AIRTIME">
      <span
        aria-hidden
        className={cn("inline-block rounded-[1px]", muted ? "bg-ink-300" : "bg-signal")}
        style={{ width: bar, height: size * 0.92, boxShadow: muted ? "none" : "0 0 12px rgba(204,255,0,0.55)" }}
      />
      <span className="font-sans font-semibold uppercase leading-none tracking-[0.22em] text-ink-50" style={{ fontSize: size * 0.82 }}>
        Airtime
      </span>
    </span>
  );
}
