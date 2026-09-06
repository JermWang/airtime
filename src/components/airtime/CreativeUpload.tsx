"use client";

import { useCallback, useRef, useState } from "react";
import { api, ApiError, type CreativeDto, type PlacementDto } from "@/lib/api";
import { cn } from "@/lib/format";

interface Props {
  placement: PlacementDto;
  onCreative: (c: CreativeDto) => void | Promise<void>;
  current: CreativeDto | null;
}

/**
 * Hand the station something to play: a file, or a link to one hosted somewhere
 * else. A thirty-minute show is not something anybody wants to push through an
 * upload form, so the link is the first-class path for shows and the station
 * probes it server-side before it will sell airtime against it.
 */
export function CreativeUpload({ placement, onCreative, current }: Props) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [tab, setTab] = useState<"link" | "file">("link");
  const [clickUrl, setClickUrl] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isText = placement.mediaTypes.length === 1 && placement.mediaTypes[0] === "TEXT";

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      setErrors([]);
      setWarnings([]);
      try {
        if (file.size > placement.maxFileBytes) {
          setErrors([`File is ${(file.size / 1024 / 1024).toFixed(1)} MB; maximum is ${(placement.maxFileBytes / 1024 / 1024).toFixed(0)} MB`]);
          return;
        }
        const { ticket } = await api<{ ticket: string }>("/api/creatives/ticket", { method: "POST", json: { placementId: placement.id } });
        const form = new FormData();
        form.set("file", file);
        form.set("placementId", placement.id);
        form.set("ticket", ticket);
        if (clickUrl && placement.allowsClickThrough) form.set("clickUrl", clickUrl);
        const res = await api<{ creative: CreativeDto }>("/api/creatives", {
          method: "POST",
          body: form,
          headers: { "x-airtime-placement-id": placement.id, "x-airtime-upload-ticket": ticket },
        });
        setWarnings(res.creative.warnings ?? []);
        await onCreative(res.creative);
      } catch (e) {
        if (e instanceof ApiError && e.status === 422) {
          const details = e.details as { creative?: CreativeDto } | undefined;
          setErrors(details?.creative?.validationErrors ?? [e.message]);
        } else {
          setErrors([(e as Error).message]);
        }
      } finally {
        setBusy(false);
      }
    },
    [placement, clickUrl, onCreative],
  );

  const submitText = useCallback(async () => {
    setBusy(true);
    setErrors([]);
    try {
      const res = await api<{ creative: CreativeDto }>("/api/creatives/text", { method: "POST", json: { placementId: placement.id, text, clickUrl: clickUrl || null } });
      await onCreative(res.creative);
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  }, [placement.id, text, clickUrl, onCreative]);

  const submitLink = useCallback(async () => {
    setBusy(true);
    setErrors([]);
    setWarnings([]);
    try {
      const creative = await api<CreativeDto>("/api/creatives/link", { method: "POST", json: { placementId: placement.id, url: link.trim() } });
      setWarnings(creative.warnings ?? []);
      await onCreative(creative);
    } catch (e) {
      const details = e instanceof ApiError ? (e.details as string[] | undefined) : undefined;
      setErrors(Array.isArray(details) && details.length ? details : [(e as Error).message]);
    } finally {
      setBusy(false);
    }
  }, [placement.id, link, onCreative]);

  const accept = placement.mediaTypes.includes("VIDEO") ? "image/png,image/jpeg,image/webp,video/mp4" : "image/png,image/jpeg,image/webp";
  const maxMinutes = Math.round(placement.maxCreativeSec / 60);
  const lengthLabel = placement.maxCreativeSec >= 120 ? `up to ${maxMinutes} minutes` : `up to ${placement.maxCreativeSec} seconds`;
  const allowsVideo = placement.mediaTypes.includes("VIDEO");

  return (
    <div className="flex flex-col gap-3">
      {isText ? (
        <>
          <textarea className="field" rows={3} maxLength={140} placeholder="Ticker message (max 140 characters)" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex items-center justify-between">
            <span className="mono text-[10px] text-ink-400">{text.length}/140</span>
            <button className="btn btn-primary btn-sm" disabled={busy || !text.trim()} onClick={() => void submitText()}>
              {busy ? "Validating…" : current ? "Replace message" : "Use this message"}
            </button>
          </div>
        </>
      ) : (
        <>
        {allowsVideo && (
          <div className="flex items-center gap-1">
            <button className={cn("btn btn-sm", tab === "link" && "border-signal text-signal")} onClick={() => setTab("link")} data-testid="tab-link">
              Paste a link
            </button>
            <button className={cn("btn btn-sm", tab === "file" && "border-signal text-signal")} onClick={() => setTab("file")} data-testid="tab-file">
              Upload a file
            </button>
            <span className="mono ml-auto text-[9.5px] uppercase tracking-[0.12em] text-ink-500">{lengthLabel}</span>
          </div>
        )}

        {allowsVideo && tab === "link" ? (
          <div className="flex flex-col gap-2">
            <input
              className="field"
              placeholder="https://…/your-show.mp4 or …/stream.m3u8"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && link.trim()) void submitLink();
              }}
              data-testid="creative-link-input"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="mono text-[9.5px] uppercase leading-relaxed tracking-[0.12em] text-ink-500">
                Direct video or HLS · {lengthLabel} · the station plays it itself, so it needs a real file, not a watch page
              </span>
              <button className="btn btn-primary btn-sm shrink-0" disabled={busy || !link.trim()} onClick={() => void submitLink()} data-testid="use-link">
                {busy ? "Checking…" : current ? "Replace" : "Use this"}
              </button>
            </div>
          </div>
        ) : (
        <div
          className={cn("relative flex min-h-[112px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-5 text-center transition", drag ? "border-signal bg-signal-soft" : "border-white/20 hover:border-white/40 hover:bg-white/[0.03]")}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f && !busy) void upload(f);
          }}
          onClick={() => { if (!busy) inputRef.current?.click(); }}
          aria-disabled={busy}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!busy) inputRef.current?.click();
            }
          }}
        >
          <input ref={inputRef} type="file" accept={accept} disabled={busy} className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }} data-testid="creative-file-input" />
          {busy ? (
            <div className="label">Validating creative…</div>
          ) : (
            <>
              <div className="text-[12.5px] text-ink-100">{current ? "Drop a new file to replace" : "Drop your creative here"}</div>
              <div className="mono mt-1 text-[10px] uppercase tracking-[0.12em] text-ink-400">
                {allowsVideo ? "H.264 MP4 · PNG · JPEG · WebP" : "PNG · JPEG · WebP"} · {placement.aspectRatio} · {lengthLabel} · {(placement.maxFileBytes / 1024 / 1024).toFixed(0)} MB
              </div>
            </>
          )}
        </div>
        )}
        </>
      )}
      {placement.allowsClickThrough && (
        <input className="field" placeholder="Click-through URL (https, optional)" value={clickUrl} onChange={(e) => setClickUrl(e.target.value)} />
      )}
      {errors.length > 0 && (
        <ul className="rounded-md border border-live/40 bg-live/10 px-3 py-2 text-[11.5px] text-[#ff8a83]" data-testid="creative-errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-[11.5px] text-amber">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
