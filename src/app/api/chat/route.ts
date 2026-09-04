import { z } from "zod";
import { route } from "@/server/route";
import { json, parseQuery, parseBody, rateLimit, assertSameOrigin } from "@/server/http";
import { getWalletSession } from "@/server/auth/session";
import { recentMessages, postMessage, DEFAULT_LIMIT, MAX_LIMIT, MAX_BODY_CHARS } from "@/server/chat/chat";

export const dynamic = "force-dynamic";

const query = z.object({
  channel: z.string().min(1).max(32).default("MAIN"),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  /** ISO timestamp: only messages newer than this, for incremental polling. */
  since: z.string().datetime().optional(),
});

export const GET = route(async (req) => {
  const { channel, limit, since } = parseQuery(req, query);
  const messages = await recentMessages(channel, limit, since ? new Date(since) : undefined);
  return json({ messages });
});

const body = z.object({
  channel: z.string().min(1).max(32).default("MAIN"),
  body: z.string().min(1).max(MAX_BODY_CHARS * 4),
});

/**
 * Post to the room. A wallet session is required: the chat has no anonymous
 * voice, and the address that signed in is the identity that appears.
 *
 * Two layers of flood control: a coarse per-IP bucket here to keep the endpoint
 * cheap, and the real per-wallet limits inside postMessage, which are enforced
 * against the database so they hold across instances.
 */
export const POST = route(async (req) => {
  rateLimit(req, "chat-post", { limit: 30, windowSec: 60 });
  assertSameOrigin(req);
  const session = await getWalletSession();
  if (!session) {
    return json({ error: "Connect a wallet to chat" }, { status: 401 });
  }
  const input = await parseBody(req, body);
  const { message } = await postMessage(input.channel, session.address, input.body);
  return json({ message });
});
