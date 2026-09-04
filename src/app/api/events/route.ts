import { boot } from "@/server/boot";
import { subscribe } from "@/server/realtime/bus";
import { serverNowMs } from "@/server/time/clock";

export const dynamic = "force-dynamic";

/** Server-Sent Events stream of station state changes. */
export async function GET(req: Request): Promise<Response> {
  await boot();
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          /* closed */
        }
      };
      send({ id: 0, at: Date.now(), type: "hello", serverTime: serverNowMs() });
      unsubscribe = subscribe(send);
      ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${serverNowMs()}\n\n`));
        } catch {
          /* closed */
        }
      }, 15_000);
      const close = () => {
        unsubscribe?.();
        if (ping) clearInterval(ping);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", close);
    },
    cancel() {
      unsubscribe?.();
      if (ping) clearInterval(ping);
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
