"use client";

import { useEffect, useRef } from "react";
import type { QueueEntryDto } from "@/lib/api";
import type { MainSource } from "./playerEngine";
import { usePlayer } from "./playerStore";

/**
 * First-party delivery analytics beacon.
 *
 * A random per-tab session id (never persisted beyond the tab) is sent with
 * events; the server stores only a daily-salted hash. Nothing here is a
 * verified impression – it is what this browser observed.
 */

type EventType = "present" | "visible" | "hidden" | "load_ok" | "load_fail" | "video_complete" | "click";

function sessionId(): string {
  try {
    let id = sessionStorage.getItem("airtime.session");
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "");
      sessionStorage.setItem("airtime.session", id);
    }
    return id;
  } catch {
    return "anon" + Math.random().toString(36).slice(2, 14);
  }
}

const queue: Array<{ campaignId: string; placementId: string; type: EventType; value?: number }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function track(campaignId: string, placementId: string, type: EventType, value?: number): void {
  queue.push({ campaignId, placementId, type, value });
  if (!flushTimer) flushTimer = setTimeout(flush, 1500);
}

function flush(): void {
  flushTimer = null;
  if (!queue.length) return;
  const events = queue.splice(0, 50);
  const body = JSON.stringify({ sessionId: sessionId(), events });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {
    /* fall through */
  }
  void fetch("/api/analytics", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
}

/** Presence + visibility sampling for everything currently on air, and completion for full-screen video spots. */
export function useAdAnalytics(active: QueueEntryDto[], source: MainSource | null): void {
  const seen = useRef(new Set<string>());
  const videoEl = usePlayer((s) => s.videoEl);

  useEffect(() => {
    for (const e of active) {
      if (!seen.current.has(e.id)) {
        seen.current.add(e.id);
        track(e.id, e.placementId, "present");
      }
    }
  }, [active]);

  useEffect(() => {
    const t = setInterval(() => {
      const visible = document.visibilityState === "visible";
      for (const e of active) track(e.id, e.placementId, visible ? "visible" : "hidden");
    }, 15_000);
    return () => clearInterval(t);
  }, [active]);

  useEffect(() => {
    if (!videoEl || !source || source.kind !== "ad-video") return;
    const c = source.campaign;
    const onEnded = () => track(c.id, c.placementId, "video_complete");
    const onOk = () => track(c.id, c.placementId, "load_ok");
    const onFail = () => track(c.id, c.placementId, "load_fail");
    videoEl.addEventListener("ended", onEnded);
    videoEl.addEventListener("loadeddata", onOk, { once: true });
    videoEl.addEventListener("error", onFail, { once: true });
    return () => {
      videoEl.removeEventListener("ended", onEnded);
      videoEl.removeEventListener("loadeddata", onOk);
      videoEl.removeEventListener("error", onFail);
    };
  }, [videoEl, source]);

  useEffect(() => {
    if (!source || source.kind !== "ad-image") return;
    const c = source.campaign;
    const img = new Image();
    img.onload = () => track(c.id, c.placementId, "load_ok");
    img.onerror = () => track(c.id, c.placementId, "load_fail");
    img.src = source.url;
  }, [source]);

  useEffect(() => {
    const onHide = () => flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);
}
