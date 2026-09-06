"use client";

import Link from "next/link";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-6">
      <p className="mono text-xs uppercase tracking-widest text-signal">AIRTIME · Connection interrupted</p>
      <h1 className="text-3xl font-medium">We couldn’t load this page.</h1>
      <p className="text-ink-300">Try again to reconnect. If you submitted a payment, check your campaign before starting another purchase.</p>
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary" onClick={() => retry()}>Try again</button>
        <Link className="btn" href="/airtime">Your campaigns</Link>
        <Link className="btn btn-ghost" href="/">Back to the station</Link>
      </div>
      {error.digest && <p className="mono text-xs text-ink-400">Error reference: {error.digest}</p>}
    </main>
  );
}
