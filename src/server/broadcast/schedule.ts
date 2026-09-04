import { and, asc, eq, gt, gte, lt, lte, desc, inArray } from "drizzle-orm";
import { db, schema, type Db, type Tx } from "../db/client";
import { serverNow, addSeconds } from "../time/clock";
import { publish } from "../realtime/bus";
import type { ProgramBlock } from "../db/schema";

/**
 * Synchronized linear programming engine.
 *
 * Programming is a timeline of ProgramBlocks per channel. Every viewer asks the
 * server for the block at `serverNow()` and seeks into it by
 * `offset = now - block.startsAt`, so everyone sees the same frame (± network).
 *
 * The engine never plays "a random video": if the timeline runs dry and the
 * channel has autoFill enabled, it appends programs from the channel library in
 * rotation, separated by AD_BREAK blocks that double as full-screen ad inventory.
 */

export interface BroadcastState {
  channelId: string;
  serverTime: number;
  now: ProgramBlock | null;
  /** Seconds into `now` at serverTime. */
  offsetSec: number;
  next: ProgramBlock | null;
  later: ProgramBlock[];
}

export async function blockAt(channelId: string, at: Date, executor: Db | Tx = db()): Promise<ProgramBlock | null> {
  const [block] = await executor
    .select()
    .from(schema.programBlocks)
    .where(and(eq(schema.programBlocks.channelId, channelId), lte(schema.programBlocks.startsAt, at), gt(schema.programBlocks.endsAt, at)))
    .orderBy(desc(schema.programBlocks.isManual), desc(schema.programBlocks.createdAt))
    .limit(1);
  return block ?? null;
}

export async function upcomingBlocks(channelId: string, after: Date, limit = 12, executor: Db | Tx = db()): Promise<ProgramBlock[]> {
  return executor
    .select()
    .from(schema.programBlocks)
    .where(and(eq(schema.programBlocks.channelId, channelId), gte(schema.programBlocks.startsAt, after)))
    .orderBy(asc(schema.programBlocks.startsAt))
    .limit(limit);
}

export async function blocksInRange(channelId: string, from: Date, to: Date, executor: Db | Tx = db()): Promise<ProgramBlock[]> {
  return executor
    .select()
    .from(schema.programBlocks)
    .where(and(eq(schema.programBlocks.channelId, channelId), lt(schema.programBlocks.startsAt, to), gt(schema.programBlocks.endsAt, from)))
    .orderBy(asc(schema.programBlocks.startsAt));
}

export async function getBroadcastState(channelId: string): Promise<BroadcastState> {
  const now = serverNow();
  const current = await blockAt(channelId, now);
  const after = current ? current.endsAt : now;
  const upcoming = await upcomingBlocks(channelId, after, 10);
  // If a manual block overlaps a scheduled one, the scheduled one still shows up in
  // `upcoming` when it starts after `after`; that's fine for the guide.
  const [next, ...later] = upcoming.filter((b) => !current || b.id !== current.id);
  return {
    channelId,
    serverTime: now.getTime(),
    now: current,
    offsetSec: current ? Math.max(0, (now.getTime() - current.startsAt.getTime()) / 1000) : 0,
    next: next ?? null,
    later,
  };
}

/** Full guide for the next `hours` hours (used by /guide and the control room). */
export async function getGuide(channelId: string, hours = 6): Promise<{ serverTime: number; blocks: ProgramBlock[] }> {
  const now = serverNow();
  const from = addSeconds(now, -60 * 60);
  const to = addSeconds(now, hours * 3600);
  const blocks = await blocksInRange(channelId, from, to);
  return { serverTime: now.getTime(), blocks };
}

/**
 * Extend the schedule so at least `horizonHours` of programming exist after now.
 * Deterministic rotation: programs in creation order, cycling, each followed by an
 * AD_BREAK. Called by the scheduler tick and after admin edits.
 */
export async function ensureScheduleHorizon(channelId: string, horizonHours = 12): Promise<number> {
  const database = db();
  const [channel] = await database.select().from(schema.channels).where(eq(schema.channels.id, channelId));
  if (!channel || !channel.autoFill) return 0;

  const rotation = await database
    .select()
    .from(schema.programs)
    .where(and(eq(schema.programs.channelId, channelId), eq(schema.programs.inRotation, true)))
    .orderBy(asc(schema.programs.createdAt));
  if (rotation.length === 0) return 0;

  const now = serverNow();
  const horizon = addSeconds(now, horizonHours * 3600);

  const [last] = await database
    .select()
    .from(schema.programBlocks)
    .where(eq(schema.programBlocks.channelId, channelId))
    .orderBy(desc(schema.programBlocks.endsAt))
    .limit(1);

  let cursor = last && last.endsAt > now ? last.endsAt : now;
  // Determine which program came last so rotation continues instead of restarting.
  let idx = 0;
  if (last?.programId) {
    const lastIdx = rotation.findIndex((p) => p.id === last.programId);
    if (lastIdx >= 0) idx = (lastIdx + 1) % rotation.length;
  }

  const inserts: Array<typeof schema.programBlocks.$inferInsert> = [];
  let guard = 0;
  while (cursor < horizon && guard++ < 500) {
    const program = rotation[idx % rotation.length];
    idx++;
    const start = cursor;
    const end = addSeconds(start, program.durationSec);
    inserts.push({
      channelId,
      programId: program.id,
      type: program.mediaType === "LIVE_HLS" ? "LIVE_HLS" : "VOD",
      title: program.title,
      mediaUrl: program.mediaUrl,
      startsAt: start,
      endsAt: end,
      durationSec: program.durationSec,
      metadata: { posterUrl: program.posterUrl, isPremium: program.isPremium, description: program.description },
      isDevData: program.isDevData,
    });
    cursor = end;
    if (channel.autoFillAdBreakSec > 0) {
      const adEnd = addSeconds(cursor, channel.autoFillAdBreakSec);
      inserts.push({
        channelId,
        type: "AD_BREAK",
        title: "Commercial break",
        mediaUrl: null,
        startsAt: cursor,
        endsAt: adEnd,
        durationSec: channel.autoFillAdBreakSec,
        metadata: {},
        isDevData: program.isDevData,
      });
      cursor = adEnd;
    }
  }
  if (inserts.length) {
    await database.insert(schema.programBlocks).values(inserts);
    publish({ type: "schedule.updated", channelId });
  }
  return inserts.length;
}

/**
 * Operator interrupt: insert a manual block starting now (or at `startsAt`).
 * Overlapping scheduled blocks are trimmed/split so the timeline stays consistent
 * and inventory booked inside ad breaks is preserved where possible.
 */
export async function insertManualBlock(input: {
  channelId: string;
  type: "VOD" | "LIVE_HLS" | "AD_BREAK" | "BUMPER";
  title: string;
  mediaUrl: string | null;
  durationSec: number;
  startsAt?: Date;
  liveSourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ProgramBlock> {
  const start = input.startsAt ?? serverNow();
  const end = addSeconds(start, input.durationSec);
  return db().transaction(async (tx) => {
    const overlapping = await tx
      .select()
      .from(schema.programBlocks)
      .where(and(eq(schema.programBlocks.channelId, input.channelId), lt(schema.programBlocks.startsAt, end), gt(schema.programBlocks.endsAt, start)));

    for (const block of overlapping) {
      // Blocks fully covered are removed; partially covered ones are trimmed. If the
      // manual block sits in the middle, the tail becomes a new block.
      if (block.startsAt >= start && block.endsAt <= end) {
        await tx.delete(schema.programBlocks).where(eq(schema.programBlocks.id, block.id));
        continue;
      }
      if (block.startsAt < start && block.endsAt > end) {
        await tx.update(schema.programBlocks).set({ endsAt: start, durationSec: Math.round((start.getTime() - block.startsAt.getTime()) / 1000) }).where(eq(schema.programBlocks.id, block.id));
        await tx.insert(schema.programBlocks).values({
          channelId: block.channelId,
          programId: block.programId,
          liveSourceId: block.liveSourceId,
          type: block.type,
          title: block.title,
          mediaUrl: block.mediaUrl,
          startsAt: end,
          endsAt: block.endsAt,
          durationSec: Math.round((block.endsAt.getTime() - end.getTime()) / 1000),
          metadata: { ...block.metadata, resumeOffsetSec: (end.getTime() - block.startsAt.getTime()) / 1000 },
          isDevData: block.isDevData,
        });
        continue;
      }
      if (block.startsAt < start) {
        await tx.update(schema.programBlocks).set({ endsAt: start, durationSec: Math.round((start.getTime() - block.startsAt.getTime()) / 1000) }).where(eq(schema.programBlocks.id, block.id));
      } else {
        await tx
          .update(schema.programBlocks)
          .set({
            startsAt: end,
            durationSec: Math.round((block.endsAt.getTime() - end.getTime()) / 1000),
            metadata: { ...block.metadata, resumeOffsetSec: (end.getTime() - block.startsAt.getTime()) / 1000 },
          })
          .where(eq(schema.programBlocks.id, block.id));
      }
    }

    const [inserted] = await tx
      .insert(schema.programBlocks)
      .values({
        channelId: input.channelId,
        type: input.type,
        title: input.title,
        mediaUrl: input.mediaUrl,
        liveSourceId: input.liveSourceId ?? null,
        startsAt: start,
        endsAt: end,
        durationSec: input.durationSec,
        metadata: input.metadata ?? {},
        isManual: true,
      })
      .returning();
    publish({ type: "schedule.updated", channelId: input.channelId });
    publish({ type: "program.changed", channelId: input.channelId, blockId: inserted.id });
    return inserted;
  });
}

/** End a manual/live block early and let the timeline resume. */
export async function endBlockNow(blockId: string): Promise<void> {
  const now = serverNow();
  const [block] = await db().select().from(schema.programBlocks).where(eq(schema.programBlocks.id, blockId));
  if (!block) return;
  if (block.startsAt >= now) {
    await db().delete(schema.programBlocks).where(eq(schema.programBlocks.id, blockId));
  } else {
    await db()
      .update(schema.programBlocks)
      .set({ endsAt: now, durationSec: Math.max(1, Math.round((now.getTime() - block.startsAt.getTime()) / 1000)) })
      .where(eq(schema.programBlocks.id, blockId));
  }
  // Fill the gap the block leaves behind.
  await ensureScheduleHorizon(block.channelId);
  publish({ type: "schedule.updated", channelId: block.channelId });
  publish({ type: "program.changed", channelId: block.channelId, blockId: null });
}

export async function deleteBlocks(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db().delete(schema.programBlocks).where(inArray(schema.programBlocks.id, ids));
}
