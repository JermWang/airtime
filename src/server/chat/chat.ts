import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db/client";
import { serverNow } from "../time/clock";
import { publish } from "../realtime/bus";
import { HttpError } from "../http";

/**
 * Station chat.
 *
 * Rules, all enforced here rather than in the route so the API, the scheduler
 * and any future client share one implementation:
 *
 *   - only a signed-in wallet may post, and the wallet is the identity
 *   - the text is sanitised server-side and stored as sanitised; the browser's
 *     string is never trusted and never rendered as markup
 *   - per-wallet flood limits are checked against the database, so they hold
 *     across server instances and survive a restart, unlike an in-memory bucket
 */

export const MAX_BODY_CHARS = 280;
export const MIN_GAP_MS = 2_000; // between two messages from one wallet
export const WINDOW_SEC = 60;
export const WINDOW_LIMIT = 10; // messages per wallet per minute
export const DUPLICATE_WINDOW_SEC = 120;
export const DEFAULT_LIMIT = 60;
export const MAX_LIMIT = 200;

export interface ChatMessageDto {
  id: string;
  channelId: string;
  wallet: string;
  body: string;
  at: string;
}

/**
 * Collapse whitespace, strip control characters and anything that would let a
 * message impersonate the interface. Returns null when nothing survives.
 */
export function sanitiseBody(raw: string): string | null {
  const cleaned = raw
    // Control characters, zero-width joiners and bidi overrides: invisible text
    // that can reorder or hide what a message actually says.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_BODY_CHARS);
}

function toDto(row: typeof schema.chatMessages.$inferSelect): ChatMessageDto {
  return { id: row.id, channelId: row.channelId, wallet: row.walletAddress, body: row.body, at: row.createdAt.toISOString() };
}

/** Recent messages for a room, oldest first (the order they are rendered in). */
export async function recentMessages(channelId: string, limit = DEFAULT_LIMIT, since?: Date): Promise<ChatMessageDto[]> {
  const capped = Math.min(MAX_LIMIT, Math.max(1, limit));
  const rows = await db()
    .select()
    .from(schema.chatMessages)
    .where(
      since
        ? and(eq(schema.chatMessages.channelId, channelId), isNull(schema.chatMessages.hiddenAt), gt(schema.chatMessages.createdAt, since))
        : and(eq(schema.chatMessages.channelId, channelId), isNull(schema.chatMessages.hiddenAt)),
    )
    .orderBy(desc(schema.chatMessages.createdAt))
    .limit(capped);
  return rows.reverse().map(toDto);
}

export interface PostResult {
  message: ChatMessageDto;
}

/**
 * Post a message as `wallet`. Throws HttpError(429) with a human sentence when a
 * flood limit is hit, so the interface can say what to do rather than "error".
 */
export async function postMessage(channelId: string, wallet: string, rawBody: string): Promise<PostResult> {
  const address = wallet.toLowerCase();
  const body = sanitiseBody(rawBody);
  if (!body) throw new HttpError(400, "Nothing to send");

  const now = serverNow();
  const windowStart = new Date(now.getTime() - WINDOW_SEC * 1000);

  const [recent] = await db()
    .select({
      count: sql<number>`count(*)::int`,
      lastAt: sql<Date | null>`max(${schema.chatMessages.createdAt})`,
    })
    .from(schema.chatMessages)
    .where(and(eq(schema.chatMessages.walletAddress, address), gt(schema.chatMessages.createdAt, windowStart)));

  const lastAt = recent?.lastAt ? new Date(recent.lastAt) : null;
  if (lastAt && now.getTime() - lastAt.getTime() < MIN_GAP_MS) {
    const wait = Math.ceil((MIN_GAP_MS - (now.getTime() - lastAt.getTime())) / 1000);
    throw new HttpError(429, `Slow down — you can send another message in ${wait}s.`);
  }
  if ((recent?.count ?? 0) >= WINDOW_LIMIT) {
    throw new HttpError(429, `That is ${WINDOW_LIMIT} messages in a minute. Give the room a moment.`);
  }

  // Repeating yourself is the cheapest kind of flood, so it is refused
  // separately from the rate limit.
  const dupSince = new Date(now.getTime() - DUPLICATE_WINDOW_SEC * 1000);
  const [dupe] = await db()
    .select({ id: schema.chatMessages.id })
    .from(schema.chatMessages)
    .where(and(eq(schema.chatMessages.walletAddress, address), eq(schema.chatMessages.body, body), gt(schema.chatMessages.createdAt, dupSince)))
    .limit(1);
  if (dupe) throw new HttpError(429, "You just said that.");

  const [row] = await db()
    .insert(schema.chatMessages)
    .values({ channelId, walletAddress: address, body, createdAt: now })
    .returning();

  const message = toDto(row);
  publish({ type: "chat.message", channelId, messageId: message.id });
  return { message };
}

/** Moderator removal. The row stays so the record of it is not lost. */
export async function hideMessage(messageId: string, by: string): Promise<void> {
  const [row] = await db()
    .update(schema.chatMessages)
    .set({ hiddenAt: serverNow(), hiddenBy: by })
    .where(and(eq(schema.chatMessages.id, messageId), isNull(schema.chatMessages.hiddenAt)))
    .returning();
  if (row) publish({ type: "chat.message", channelId: row.channelId, messageId: row.id });
}
