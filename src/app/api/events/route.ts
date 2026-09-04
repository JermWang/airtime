import { boot } from "@/server/boot";
import { subscribe } from "@/server/realtime/bus";
import { touchViewer, dropViewer, viewerCount } from "@/server/realtime/presence";
import { serverNowMs } from "@/server/time/clock";

export const dynamic = "force-dynamic";
/**
 * A serverless function is killed at its time limit, so the stream closes itself
 * a little earlier and the browser reconnects (EventSource does this natively).
 * Off serverless the stream simply lives until the client goes away.
 */
export const maxDuration = 60;
// Default sits under the 60s ceiling of Vercel's Hobby plan. On a plan with a
// longer function limit, raise both this and maxDuration.
const STREAM_LIFETIME_MS = Number(process.env.AIRTIME_SSE_LIFETIME_MS ?? 50_000);

/** Server-Sent Events stream of station state changes. */
export async function GET(req: Request): Promise<Response> {
  await boot();
  const encoder = new TextEncoder();
  // One presence slot per tab, not per connection: the stream recycles itself
  // every 50 seconds and the viewer should not blink out when it does.
  const viewerId = new URL(req.url).searchParams.get("v")?.slice(0, 64) || null;
  let unsubscribe: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  let lifetime: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          /* closed */
        }
      };
      if (viewerId) touchViewer(viewerId);
      send({ id: 0, at: Date.now(), type: "hello", serverTime: serverNowMs(), viewers: viewerCount() });
      unsubscribe = subscribe(send);
      ping = setInterval(() => {
        if (viewerId) touchViewer(viewerId);
        try {
          controller.enqueue(encoder.encode(`: ping ${serverNowMs()}\n\n`));
        } catch {
          /* closed */
        }
      }, 15_000);
      const close = () => {
        unsubscribe?.();
        if (ping) clearInterval(ping);
        if (lifetime) clearTimeout(lifetime);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      lifetime = setTimeout(close, STREAM_LIFETIME_MS);
      lifetime.unref?.();
      req.signal.addEventListener("abort", close);
    },
    cancel() {
      unsubscribe?.();
      // A cancel is the tab going away rather than the stream recycling, so the
      // viewer leaves now instead of ageing out.
      if (viewerId) dropViewer(viewerId);
      if (ping) clearInterval(ping);
      if (lifetime) clearTimeout(lifetime);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
