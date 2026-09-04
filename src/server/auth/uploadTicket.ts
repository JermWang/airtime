import { createHmac, timingSafeEqual } from "node:crypto";
import { uploadSecret } from "../env";

/**
 * Signed upload tickets. An upload must present a ticket issued for the same
 * wallet + placement within the last 10 minutes. Together with the wallet
 * session this makes uploads an explicit, signed intent rather than an open
 * endpoint.
 */
export interface UploadTicket {
  wallet: string;
  placementId: string;
  exp: number;
}

function sign(payload: string): string {
  return createHmac("sha256", uploadSecret()).update(payload).digest("base64url");
}

export function issueUploadTicket(wallet: string, placementId: string, ttlSec = 600): string {
  const payload = Buffer.from(JSON.stringify({ wallet: wallet.toLowerCase(), placementId, exp: Math.floor(Date.now() / 1000) + ttlSec } satisfies UploadTicket)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyUploadTicket(ticket: string, wallet: string, placementId: string): boolean {
  const [payload, sig] = ticket.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as UploadTicket;
    return parsed.wallet === wallet.toLowerCase() && parsed.placementId === placementId && parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
