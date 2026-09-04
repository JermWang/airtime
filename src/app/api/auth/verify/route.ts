import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { verifyMessage, type Hex } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { cookies } from "next/headers";
import { route } from "@/server/route";
import { json, parseBody, rateLimit, assertSameOrigin, HttpError } from "@/server/http";
import { db, schema } from "@/server/db/client";
import { signSession, cookieOptions, WALLET_COOKIE } from "@/server/auth/session";
import { activeChain } from "@/lib/chain/chains";
import { publicClient } from "@/server/chain/client";

export const dynamic = "force-dynamic";

const body = z.object({ message: z.string().min(20).max(4000), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });
const SESSION_TTL = 7 * 24 * 3600;

export const POST = route(async (req) => {
  rateLimit(req, "auth-verify", { limit: 20, windowSec: 60 });
  assertSameOrigin(req);
  const { message, signature } = await parseBody(req, body);
  const parsed = parseSiweMessage(message);
  const host = req.headers.get("host") ?? "";
  const domain = host.split(":")[0];

  if (!parsed.address || !parsed.nonce) throw new HttpError(400, "Malformed sign-in message");
  const valid = validateSiweMessage({ message: parsed, address: parsed.address, domain: host, nonce: parsed.nonce, time: new Date() }) || validateSiweMessage({ message: parsed, address: parsed.address, domain, nonce: parsed.nonce, time: new Date() });
  if (!valid) throw new HttpError(400, "Sign-in message is not valid for this site");
  if (parsed.chainId !== activeChain().id) throw new HttpError(400, "Sign-in message is for a different chain");

  // Nonce must exist, be unexpired and unused. Consumed atomically.
  const [nonceRow] = await db()
    .update(schema.authNonces)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.authNonces.nonce, parsed.nonce), isNull(schema.authNonces.usedAt)))
    .returning();
  if (!nonceRow || nonceRow.expiresAt < new Date()) throw new HttpError(400, "Sign-in nonce is invalid or expired");

  // EOA verification is done locally; smart-contract wallets fall back to on-chain ERC-1271/6492 checks.
  let ok = false;
  try {
    ok = await verifyMessage({ address: parsed.address, message, signature: signature as Hex });
  } catch {
    ok = false;
  }
  if (!ok) {
    try {
      ok = await publicClient().verifyMessage({ address: parsed.address, message, signature: signature as Hex });
    } catch {
      ok = false;
    }
  }
  if (!ok) throw new HttpError(401, "Signature does not match the wallet");

  const address = parsed.address.toLowerCase() as `0x${string}`;
  await db()
    .insert(schema.wallets)
    .values({ address, lastChainId: parsed.chainId ?? null })
    .onConflictDoUpdate({ target: schema.wallets.address, set: { lastSeenAt: new Date(), lastChainId: parsed.chainId ?? null } });

  const token = await signSession({ kind: "wallet", address, chainId: parsed.chainId ?? activeChain().id }, SESSION_TTL);
  const store = await cookies();
  store.set(WALLET_COOKIE, token, cookieOptions(SESSION_TTL));
  return json({ ok: true, address });
});
