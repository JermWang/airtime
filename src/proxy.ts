import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Request proxy (Next 16's middleware):
 *   - strict Content-Security-Policy with a per-request nonce
 *   - server-side gate for /control-room and /api/admin (the routes re-verify)
 */

const WALLETCONNECT = "https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.org wss://*.walletconnect.com https://*.reown.com wss://*.reown.com https://*.web3modal.org https://*.web3modal.com";

function mediaOrigins(): string {
  return (process.env.NEXT_PUBLIC_MEDIA_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

function rpcOrigins(): string {
  const list = [
    "https://rpc.mainnet.chain.robinhood.com",
    "https://rpc.testnet.chain.robinhood.com",
    "http://127.0.0.1:8545",
    "http://localhost:8545",
    "ws://127.0.0.1:8545",
    "ws://localhost:8545",
  ];
  const custom = process.env.NEXT_PUBLIC_RPC_URL;
  if (custom) {
    try {
      list.push(new URL(custom).origin);
    } catch {
      /* ignore */
    }
  }
  const storage = process.env.STORAGE_PUBLIC_BASE_URL;
  if (storage) {
    try {
      list.push(new URL(storage).origin);
    } catch {
      /* ignore */
    }
  }
  return list.join(" ");
}

function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  const media = mediaOrigins();
  const storage = process.env.STORAGE_PUBLIC_BASE_URL ? new URL(process.env.STORAGE_PUBLIC_BASE_URL).origin : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${media} ${storage} https://*.walletconnect.com https://*.walletconnect.org https://*.reown.com https://storage.googleapis.com`,
    `media-src 'self' blob: data: ${media} ${storage}`,
    `connect-src 'self' ${rpcOrigins()} ${media} ${storage} ${WALLETCONNECT}${dev ? " ws://localhost:* http://localhost:*" : ""}`,
    "font-src 'self' data:",
    `frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org https://*.reown.com`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

async function hasAdminSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("airtime_admin")?.value;
  if (!token) return false;
  const secret = process.env.AIRTIME_SESSION_SECRET || (process.env.NODE_ENV !== "production" ? "airtime-dev-session-secret-not-for-production-0000000000" : "");
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { issuer: "airtime", audience: "admin" });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/control-room") && pathname !== "/control-room/login") {
    if (!(await hasAdminSession(req))) {
      const url = req.nextUrl.clone();
      url.pathname = "/control-room/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }
  if (pathname.startsWith("/api/admin") && !pathname.startsWith("/api/admin/auth")) {
    if (!(await hasAdminSession(req))) {
      return NextResponse.json({ error: "Admin sign-in required" }, { status: 401 });
    }
  }

  const nonce = btoa(crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + String.fromCharCode(b), ""));
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);
  return res;
}

export const config = {
  matcher: [
    // Skip static assets; everything else gets CSP + auth gates.
    "/((?!_next/static|_next/image|favicon.ico|models/|media/|fonts/|.*\\.(?:png|jpg|jpeg|webp|svg|ico|glb|mp4|woff2?)$).*)",
  ],
};
