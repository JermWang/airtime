import { randomBytes } from "node:crypto";
import { route } from "@/server/route";
import { json, rateLimit } from "@/server/http";
import { db, schema } from "@/server/db/client";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  rateLimit(req, "auth-nonce", { limit: 30, windowSec: 60 });
  const nonce = randomBytes(24).toString("hex");
  await db().insert(schema.authNonces).values({ nonce, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
  return json({ nonce });
});
