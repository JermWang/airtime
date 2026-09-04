"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type Hls from "hls.js";
import { useBroadcastState, useActivations } from "@/lib/hooks";
import { useClock, useStation } from "@/lib/store";
import { usePlayer } from "./playerStore";
import { driftCorrection, resolveMainSource, sourceKey, syncOffsetSec, targetOffsetSec, type MainSource } from "./playerEngine";
import { Overlays } from "./Overlays";
import { useAdAnalytics } from "./analytics";
import { Wordmark } from "@/components/hud/Wordmark";
import { cn } from "@/lib/format";

interface Props {
  channelId?: string;
  /** Render the picture in the DOM (2D mode). When false the element still plays (feeds the WebGL texture). */
  visible: boolean;
  className?: string;
  /** Show DOM overlays (lower third, bug, ticker) on top of the picture. */
  overlays?: boolean;
  /** How the picture fills its box. "cover" is for the full-bleed hero. */
  fit?: "contain" | "cover";
}

function canPlayNativeHls(video: HTMLVideoElement): boolean {
  return Boolean(video.canPlayType("application/vnd.apple.mpegurl"));
}

/**
 * The linear station player. One instance per page.
 *
 * - Plays the scheduled block at the server-derived offset and corrects drift.
 * - During AD_BREAK blocks it plays the full-screen campaign that owns the slot
 *   (video or image) or a house slate when nothing is booked.
 * - Uses hls.js for LIVE_HLS blocks when native HLS is unavailable.
 */
export function StationPlayer({ channelId = "MAIN", visible, className, overlays = true, fit = "contain" }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const { data: state } = useBroadcastState(channelId);
  const { data: activations } = useActivations(channelId);
  const now = useClock((s) => s.now);
  const muted = useStation((s) => s.muted);
  const volume = useStation((s) => s.volume);
  const setSoundBlocked = useStation((s) => s.setSoundBlocked);
  const restoreSoundPreference = useStation((s) => s.restoreSoundPreference);
  const { setVideoEl, setSource, setPlaying, setError, setHolding, setDrift } = usePlayer();
  const source = usePlayer((s) => s.source);
  const holding = usePlayer((s) => s.holding);
  const error = usePlayer((s) => s.error);
  const [tick, setTick] = useState(0);

  // Recompute which source should be on air twice a second (cheap; pure function).
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 500);
    return () => clearInterval(t);
  }, []);

  const resolved = useMemo<MainSource | null>(() => {
    if (!state) return null;
    const nowMs = now();
    // If the cached block ended, fall through to `next` until the refetch lands.
    let block = state.now;
    let next = state.next;
    if (block && new Date(block.endsAt).getTime() <= nowMs) {
      block = state.next && new Date(state.next.startsAt).getTime() <= nowMs ? state.next : null;
      next = state.later[0] ?? null;
    }
    return resolveMainSource(block, next, activations?.active ?? [], nowMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, activations, tick]);

  const key = resolved ? sourceKey(resolved) : "none";
  const lastKey = useRef<string>("");

  useEffect(() => {
    setVideoEl(videoRef.current);
    return () => setVideoEl(null);
  }, [setVideoEl]);

  useAdAnalytics(activations?.active ?? [], resolved);

  // Load media when the source identity changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolved) return;
    setSource(resolved);
    if (lastKey.current === key) return;
    lastKey.current = key;
    setError(null);
    setHolding(false);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Browsers refuse to start audio without a gesture. If that happens the
    // picture must never stall: fall back to muted playback and tell the UI to
    // ask for a click, rather than leaving a paused black screen.
    const attemptPlay = () => {
      const p = video.play();
      if (!p) return;
      p.catch(() => {
        if (video.muted) return;
        video.muted = true;
        setSoundBlocked(true);
        const retry = video.play();
        if (retry) retry.catch(() => {});
      });
    };

    if (resolved.kind === "vod" || (resolved.kind === "campaign-video" && !resolved.hls)) {
      // Submitted media loops: a spot repeats through its break, a show repeats
      // for as long as its buyer holds the screen.
      video.loop = resolved.kind === "campaign-video";
      video.src = resolved.url;
      video.load();
      const onMeta = () => {
        const target = resolved.kind === "vod" ? targetOffsetSec(resolved.block, now()) : syncOffsetSec(resolved.sync, now());
        if (Number.isFinite(video.duration) && target >= video.duration - 0.25) {
          setHolding(true);
        } else {
          video.currentTime = target;
        }
        attemptPlay();
      };
      video.addEventListener("loadedmetadata", onMeta, { once: true });
      return () => video.removeEventListener("loadedmetadata", onMeta);
    }

    if (resolved.kind === "hls" || (resolved.kind === "campaign-video" && resolved.hls)) {
      video.loop = false;
      const live = resolved.kind === "hls" && resolved.live;
      const seekVod = () => {
        if (!live) {
          const target = resolved.kind === "hls" ? targetOffsetSec(resolved.block, now()) : syncOffsetSec(resolved.sync, now());
          if (Number.isFinite(video.duration) && target >= video.duration - 0.25) setHolding(true);
          else video.currentTime = target;
        }
      };
      if (canPlayNativeHls(video)) {
        video.src = resolved.url;
        video.load();
        video.addEventListener("loadedmetadata", () => { seekVod(); attemptPlay(); }, { once: true });
        return;
      }
      let cancelled = false;
      void import("hls.js").then(({ default: HlsCtor }) => {
        if (cancelled || !HlsCtor.isSupported()) {
          if (!cancelled) setError("HLS is not supported in this browser");
          return;
        }
        const hls = new HlsCtor({ liveSyncDurationCount: 3, lowLatencyMode: true, enableWorker: true });
        hlsRef.current = hls;
        hls.on(HlsCtor.Events.ERROR, (_e, data) => {
          if (data.fatal) setError(`Live stream error: ${data.type}`);
        });
        hls.loadSource(resolved.url);
        hls.attachMedia(video);
        hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
          video.addEventListener("loadedmetadata", seekVod, { once: true });
          attemptPlay();
        });
      });
      return () => {
        cancelled = true;
      };
    }

    // Slates and image ads: release the media element.
    video.removeAttribute("src");
    video.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, resolved]);

  // Drift correction loop (VOD & ad video only).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const t = setInterval(() => {
      const src = usePlayer.getState().source;
      if (!src || (src.kind !== "vod" && src.kind !== "campaign-video" && !(src.kind === "hls" && !src.live))) return;
      if (video.readyState < 1 || usePlayer.getState().holding) return;
      const target = src.kind === "campaign-video" ? syncOffsetSec(src.sync, now()) : targetOffsetSec(src.block, now());
      if (Number.isFinite(video.duration) && target >= video.duration - 0.25) {
        setHolding(true);
        video.pause();
        return;
      }
      const drift = video.currentTime - target;
      setDrift(drift);
      const corr = driftCorrection(video.currentTime, target);
      if (corr.action === "seek") video.currentTime = corr.to;
      else if (video.playbackRate !== corr.rate) video.playbackRate = corr.rate;
      if (video.paused && !video.ended) {
        const p = video.play();
        if (p) p.catch(() => {});
      }
    }, 1000);
    return () => clearInterval(t);
  }, [now, setDrift, setHolding]);

  // Element event wiring.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlaying = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => setError(video.error ? `Media error ${video.error.code}` : "Media error");
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onPause);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onPause);
      video.removeEventListener("error", onError);
    };
  }, [setPlaying, setError]);

  useEffect(() => {
    restoreSoundPreference();
  }, [restoreSoundPreference]);

  // The single media element carries the audio for the programme and for any
  // commercial a buyer has placed on the main picture. The 3D screen samples the
  // same element, so what you see and what you hear can never disagree.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.volume = volume;
    if (!muted) {
      setSoundBlocked(false);
      // Unmuting is itself the user gesture, so this is the moment audio is
      // allowed to start if the autoplay policy had paused it.
      const p = video.play();
      if (p) p.catch(() => setSoundBlocked(true));
    }
  }, [muted, volume, setSoundBlocked]);

  useEffect(() => () => hlsRef.current?.destroy(), []);

  const showVideo = source && (source.kind === "vod" || source.kind === "hls" || source.kind === "campaign-video") && !holding && !error;
  const slate = source?.kind === "slate" ? source : null;

  return (
    <div className={cn("relative overflow-hidden bg-black", visible ? className : "pointer-events-none fixed -left-[9999px] top-0 h-[2px] w-[2px] opacity-0")} aria-label="AIRTIME station">
      <video
        ref={videoRef}
        className={cn("h-full w-full", fit === "cover" ? "object-cover" : "object-contain", showVideo ? "opacity-100" : "opacity-0")}
        playsInline
        muted={muted}
        autoPlay
        crossOrigin="anonymous"
        preload="auto"
        aria-hidden={!visible}
      />
      {visible && source?.kind === "campaign-image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source.url} alt="" className={cn("absolute inset-0 h-full w-full", fit === "cover" || source.campaign.fit === "FILL" ? "object-cover" : "object-contain")} />
      )}
      {visible && (slate || holding || error) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink-950">
          <Wordmark size={44} />
          <div className="label">{error ?? (holding ? "Stand by" : slate?.subtitle)}</div>
          {slate && slate.title !== "AIRTIME" && <div className="text-lg tracking-tight text-ink-100">{slate.title}</div>}
        </div>
      )}
      {visible && overlays && <Overlays channelId={channelId} />}
    </div>
  );
}
