"use client";

import { useCallback, useRef, useState } from "react";
import { api, ApiError, type CreativeDto, type PlacementDto } from "@/lib/api";
import { cn } from "@/lib/format";

interface Props {
  placement: PlacementDto;
  onCreative: (c: CreativeDto) => void;
  current: CreativeDto | null;
}

/** Upload (or type) a creative for a placement; validation happens server-side. */
export function CreativeUpload({ placement, onCreative, current }: Props) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [text, setText] = useState("");
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
        const res = await api<{ creative: CreativeDto }>("/api/creatives", { method: "POST", body: form });
        setWarnings(res.creative.warnings ?? []);
        onCreative(res.creative);
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
      onCreative(res.creative);
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  }, [placement.id, text, clickUrl, onCreative]);

  const accept = placement.mediaTypes.includes("VIDEO") ? "image/png,image/jpeg,image/webp,video/mp4" : "image/png,image/jpeg,image/webp";

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
            if (f) void upload(f);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
        >
          <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} data-testid="creative-file-input" />
          {busy ? (
            <div className="label">Validating creative…</div>
          ) : (
            <>
              <div className="text-[12.5px] text-ink-100">{current ? "Drop a new file to replace" : "Drop your creative here"}</div>
              <div className="mono mt-1 text-[10px] uppercase tracking-[0.12em] text-ink-400">
                {placement.mediaTypes.includes("VIDEO") ? "PNG · JPEG · WebP · H.264 MP4" : "PNG · JPEG · WebP"} · {placement.aspectRatio} · up to {placement.maxWidth}×{placement.maxHeight} · {(placement.maxFileBytes / 1024 / 1024).toFixed(0)} MB
              </div>
            </>
          )}
        </div>
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
