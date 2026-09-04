import { EventEmitter } from "node:events";

/**
 * In-process realtime bus. Every state change that viewers or operators care
 * about is published here and streamed to browsers over Server-Sent Events
 * (see /api/events). For multi-instance deployments, bridge this emitter to a
 * shared pub/sub (Redis, Postgres LISTEN/NOTIFY) – the event shape stays the same.
 */

export type RealtimeEvent =
  | { type: "program.changed"; channelId: string; blockId: string | null }
  | { type: "schedule.updated"; channelId: string }
  | { type: "campaign.updated"; campaignId: string; status: string; placementId: string }
  | { type: "queue.updated"; channelId: string }
  | { type: "placement.activated"; placementId: string; campaignId: string; channelId: string }
  | { type: "placement.released"; placementId: string; campaignId: string; channelId: string }
  | { type: "placement.updated"; placementId: string }
  | { type: "placements.updated" }
  | { type: "payment.confirmed"; campaignId: string; txHash: string }
  | { type: "settings.updated"; key: string }
  | { type: "clock.updated"; offsetMs: number };

export type RealtimeEnvelope = RealtimeEvent & { id: number; at: number };

declare global {
  // eslint-disable-next-line no-var
  var __airtimeBus: EventEmitter | undefined;
  // eslint-disable-next-line no-var
  var __airtimeBusSeq: number | undefined;
}

function emitter(): EventEmitter {
  if (!globalThis.__airtimeBus) {
    const e = new EventEmitter();
    e.setMaxListeners(10_000);
    globalThis.__airtimeBus = e;
  }
  return globalThis.__airtimeBus;
}

export function publish(event: RealtimeEvent): void {
  const seq = (globalThis.__airtimeBusSeq = (globalThis.__airtimeBusSeq ?? 0) + 1);
  const envelope: RealtimeEnvelope = { ...event, id: seq, at: Date.now() };
  emitter().emit("event", envelope);
}

export function subscribe(listener: (e: RealtimeEnvelope) => void): () => void {
  const em = emitter();
  em.on("event", listener);
  return () => em.off("event", listener);
}
