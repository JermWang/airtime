"use client";

import { useStation } from "@/lib/store";
import { cn } from "@/lib/format";

/**
 * Sound for the station.
 *
 * One media element carries the audio for the programme and for whatever a
 * buyer has put on the main picture, so this control governs both. It starts
 * muted because browsers refuse to autoplay audio, and the choice is remembered
 * for the next visit.
 */
export function SoundControl({ compact = false }: { compact?: boolean }) {
  const muted = useStation((s) => s.muted);
  const volume = useStation((s) => s.volume);
  const setMuted = useStation((s) => s.setMuted);
  const setVolume = useStation((s) => s.setVolume);
  const on = !muted && volume > 0;

  return (
    <div className="flex items-center gap-1.5">
      <button
        className={cn("btn btn-ghost", on && "text-signal")}
        onClick={() => setMuted(!muted)}
        aria-pressed={on}
        aria-label={on ? "Mute the station" : "Turn the sound on"}
        title={on ? "Mute" : "Sound on"}
      >
        <SpeakerIcon on={on} />
        <span className={cn(compact && "sr-only")}>{on ? "Sound on" : "Sound off"}</span>
      </button>
      {!compact && (
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((muted ? 0 : volume) * 100)}
          onChange={(e) => {
            const v = Number(e.target.value) / 100;
            setVolume(v);
            if (v > 0 && muted) setMuted(false);
          }}
          aria-label="Volume"
          className="volume hidden lg:block"
        />
      )}
    </div>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h2.2L8.4 3.4v9.2L5.2 10H3z" />
      {on ? (
        <>
          <path d="M10.8 5.8a3 3 0 0 1 0 4.4" />
          <path d="M12.6 4a5.4 5.4 0 0 1 0 8" />
        </>
      ) : (
        <path d="M11 6.2l3.2 3.6M14.2 6.2L11 9.8" />
      )}
    </svg>
  );
}

/**
 * Shown only when the browser refused to start audio. Clicking is the gesture
 * the autoplay policy is waiting for.
 */
export function SoundBlockedPrompt() {
  const blocked = useStation((s) => s.soundBlocked);
  const muted = useStation((s) => s.muted);
  const setMuted = useStation((s) => s.setMuted);
  if (!blocked || !muted) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center md:bottom-16">
      <button className="btn btn-primary pointer-events-auto" onClick={() => setMuted(false)}>
        Click for sound
      </button>
    </div>
  );
}
