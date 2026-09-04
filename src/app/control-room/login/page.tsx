"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Wordmark } from "@/components/hud/Wordmark";
import { api } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="glass-strong specular w-full max-w-sm rounded-xl p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/admin/auth/login", { method: "POST", json: { email, password } });
          router.push(params.get("next") || "/control-room");
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Wordmark size={14} />
      <div className="label mb-5 mt-2">Control room sign-in</div>
      <label className="mb-3 flex flex-col gap-1">
        <span className="label">Email</span>
        <input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="admin-email" />
      </label>
      <label className="mb-4 flex flex-col gap-1">
        <span className="label">Password</span>
        <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="admin-password" />
      </label>
      {error && <div className="mb-3 text-[11.5px] text-live">{error}</div>}
      <button className="btn btn-primary w-full" disabled={busy} type="submit" data-testid="admin-login">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink-950 p-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
