import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-6">
      <p className="mono text-xs uppercase tracking-widest text-signal">AIRTIME · 404</p>
      <h1 className="text-3xl font-medium">This page is off the air.</h1>
      <p className="text-ink-300">The link may be outdated, or the address may be incomplete. The station is one click away.</p>
      <div className="flex flex-wrap gap-3">
        <Link className="btn btn-primary" href="/">Watch the station</Link>
        <Link className="btn" href="/airtime">Browse airtime</Link>
      </div>
    </main>
  );
}
