"use client";

import { cn } from "@/lib/format";

export function Panel({ title, children, className, actions }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-white/10 bg-ink-900/70", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <div className="label-strong">{title}</div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "signal" | "live" | "amber" }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/30 px-3 py-2.5">
      <div className="label">{label}</div>
      <div className={cn("mono mt-1 text-[20px] tracking-tight", tone === "signal" ? "text-signal" : tone === "live" ? "text-live" : tone === "amber" ? "text-amber" : "text-ink-50")}>{value}</div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="text-[10.5px] text-ink-500">{hint}</span>}
    </label>
  );
}

export function StatusChip({ status }: { status: string }) {
  const tone = status === "AIRING" ? "chip-live" : ["QUEUED", "PAID", "COMPLETED", "APPROVED", "CONFIRMED", "VALID"].includes(status) ? "chip-signal" : ["REJECTED", "CANCELLED", "REFUNDED", "FAILED", "INVALID"].includes(status) ? "chip-amber" : "";
  return <span className={cn("chip", tone)}>{status.replace(/_/g, " ")}</span>;
}
