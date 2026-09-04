import { generateSiweNonce } from "viem/siwe";
import { route } from "@/server/route";
import { json, rateLimit } from "@/server/http";
import { db, schema } from "@/server/db/client";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  rateLimit(req, "auth-nonce", { limit: 30, windowSec: 60 });
  const nonce = generateSiweNonce();
  await db().insert(schema.authNonces).values({ nonce, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
  return json({ nonce });
});
