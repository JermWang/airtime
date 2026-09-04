import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sessionSecret, isProduction } from "../env";

/**
 * Stateless signed sessions (HS256 JWT in an httpOnly cookie).
 *
 *   airtime_wallet – advertiser session established through Sign-In With Ethereum
 *   airtime_admin  – control-room session established with email + password
 */

export const WALLET_COOKIE = "airtime_wallet";
export const ADMIN_COOKIE = "airtime_admin";

export interface WalletSession {
  kind: "wallet";
  address: `0x${string}`; // lowercase
  chainId: number;
}

export interface AdminSession {
  kind: "admin";
  adminId: string;
  email: string;
  role: "OWNER" | "OPERATOR" | "MODERATOR";
}

type Session = WalletSession | AdminSession;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(sessionSecret());
}

export async function signSession(session: Session, ttlSeconds: number): Promise<string> {
  return new SignJWT(session as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("airtime")
    .setAudience(session.kind)
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secretKey());
}

export async function verifySessionToken<T extends Session>(token: string, kind: T["kind"]): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: "airtime", audience: kind });
    if (payload.kind !== kind) return null;
    return payload as unknown as T;
  } catch {
    return null;
  }
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(),
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function getWalletSession(): Promise<WalletSession | null> {
  const store = await cookies();
  const token = store.get(WALLET_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken<WalletSession>(token, "wallet");
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken<AdminSession>(token, "admin");
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 401,
  ) {
    super(message);
  }
}

export async function requireWallet(): Promise<WalletSession> {
  const s = await getWalletSession();
  if (!s) throw new AuthError("Wallet sign-in required");
  return s;
}

export async function requireAdmin(roles?: AdminSession["role"][]): Promise<AdminSession> {
  const s = await getAdminSession();
  if (!s) throw new AuthError("Admin sign-in required");
  if (roles && !roles.includes(s.role)) throw new AuthError("Insufficient role", 403);
  return s;
}
