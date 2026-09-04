"use client";

import { useState } from "react";
import { useAdminSchedule, useAdminPrograms, useLiveSources, useAdminChannels, useAdminMutation, type ProgramDto } from "@/components/control-room/adminApi";
import { Panel, Field } from "@/components/control-room/ui";
import { api } from "@/lib/api";
import { formatClock, formatDurationSec, cn } from "@/lib/format";
import { useServerNow } from "@/lib/hooks";

export default function SchedulePage() {
  const [channel, setChannel] = useState("MAIN");
  const { data: channels } = useAdminChannels();
  const { data: schedule } = useAdminSchedule(channel, 12);
  const { data: programs } = useAdminPrograms();
  const { data: live } = useLiveSources();
  const now = useServerNow(1000);

  const insert = useAdminMutation((body: Record<string, unknown>) => api("/api/admin/schedule", { method: "POST", json: body }));
  const endBlock = useAdminMutation((id: string) => api(`/api/admin/schedule/${id}`, { method: "POST" }));
  const deleteBlock = useAdminMutation((id: string) => api(`/api/admin/schedule/${id}`, { method: "DELETE" }));
  const createProgram = useAdminMutation((body: Record<string, unknown>) => api("/api/admin/programs", { method: "POST", json: body }));
  const patchProgram = useAdminMutation((v: { id: string; body: Partial<ProgramDto> }) => api(`/api/admin/programs/${v.id}`, { method: "PATCH", json: v.body }));
  const deleteProgram = useAdminMutation((id: string) => api(`/api/admin/programs/${id}`, { method: "DELETE" }));
  const createLive = useAdminMutation((body: Record<string, unknown>) => api("/api/admin/live-sources", { method: "POST", json: body }));
  const deleteLive = useAdminMutation((id: string) => api(`/api/admin/live-sources/${id}`, { method: "DELETE" }));
  const patchChannel = useAdminMutation((body: Record<string, unknown>) => api("/api/admin/channels", { method: "PATCH", json: body }));

  const [manual, setManual] = useState({ type: "LIVE_HLS", title: "", mediaUrl: "", durationSec: 600, liveSourceId: "" });
  const [prog, setProg] = useState({ title: "", mediaUrl: "", posterUrl: "", durationSec: 600, isPremium: false, description: "" });
  const [ls, setLs] = useState({ name: "", hlsUrl: "" });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="label">Channel</div>
        {channels?.channels.map((c) => (
          <button key={c.id} className={cn("btn btn-sm", channel === c.id && "bg-white/10", !c.isActive && "opacity-50")} onClick={() => setChannel(c.id)}>
            {c.id}
          </button>
        ))}
        {channels?.channels
          .filter((c) => c.id === channel)
          .map((c) => (
            <div key={c.id} className="ml-auto flex items-center gap-2">
              <label className="flex items-center gap-2 text-[11px] text-ink-300">
                <input type="checkbox" checked={c.isActive} onChange={(e) => patchChannel.mutate({ id: c.id, isActive: e.target.checked })} /> active
              </label>
              <label className="flex items-center gap-2 text-[11px] text-ink-300">
                <input type="checkbox" checked={c.autoFill} onChange={(e) => patchChannel.mutate({ id: c.id, autoFill: e.target.checked })} /> auto-fill
              </label>
              <label className="flex items-center gap-2 text-[11px] text-ink-300">
                break
                <input className="field w-20" type="number" defaultValue={c.autoFillAdBreakSec} onBlur={(e) => patchChannel.mutate({ id: c.id, autoFillAdBreakSec: Number(e.target.value) })} />s
              </label>
            </div>
          ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Panel title="Timeline · next 12h">
          <ul className="flex flex-col gap-0.5">
            {schedule?.blocks.map((b) => {
              const start = new Date(b.startsAt).getTime();
              const end = new Date(b.endsAt).getTime();
              const isNow = start <= now && now < end;
              const past = end <= now;
              return (
                <li key={b.id} className={cn("flex items-center gap-3 rounded-md px-2 py-1.5", isNow && "bg-signal-soft", past && "opacity-40")}>
                  <span className="mono w-12 text-[10px] text-ink-300">{formatClock(b.startsAt, false)}</span>
                  <span className={cn("chip", b.type === "AD_BREAK" ? "chip-signal" : b.type === "LIVE_HLS" ? "chip-live" : "")}>{b.type}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-50">
                    {b.title} {b.isManual && <span className="chip chip-amber ml-1">manual</span>}
                  </span>
                  <span className="mono text-[10px] text-ink-400">{formatDurationSec(b.durationSec)}</span>
                  {isNow ? (
                    <button className="btn btn-sm btn-danger" onClick={() => endBlock.mutate(b.id)}>
                      End now
                    </button>
                  ) : !past ? (
                    <button className="btn btn-sm btn-ghost" onClick={() => deleteBlock.mutate(b.id)}>
                      Remove
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Interrupt / insert block">
            <div className="flex flex-col gap-2">
              <Field label="Type">
                <select className="field" value={manual.type} onChange={(e) => setManual({ ...manual, type: e.target.value })}>
                  <option value="LIVE_HLS">LIVE_HLS</option>
                  <option value="VOD">VOD</option>
                  <option value="AD_BREAK">AD_BREAK</option>
                  <option value="BUMPER">BUMPER</option>
                </select>
              </Field>
              {manual.type === "LIVE_HLS" && (
                <Field label="Live source">
                  <select className="field" value={manual.liveSourceId} onChange={(e) => setManual({ ...manual, liveSourceId: e.target.value, mediaUrl: live?.liveSources.find((s) => s.id === e.target.value)?.hlsUrl ?? "" })}>
                    <option value="">— choose —</option>
                    {live?.liveSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Title">
                <input className="field" value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} />
              </Field>
              {manual.type !== "AD_BREAK" && (
                <Field label="Media URL">
                  <input className="field" value={manual.mediaUrl} onChange={(e) => setManual({ ...manual, mediaUrl: e.target.value })} />
                </Field>
              )}
              <Field label="Duration (s)">
                <input className="field" type="number" value={manual.durationSec} onChange={(e) => setManual({ ...manual, durationSec: Number(e.target.value) })} />
              </Field>
              <button
                className="btn btn-primary"
                disabled={!manual.title || (manual.type !== "AD_BREAK" && !manual.mediaUrl)}
                onClick={() =>
                  insert.mutate({ channelId: channel, type: manual.type, title: manual.title, mediaUrl: manual.type === "AD_BREAK" ? null : manual.mediaUrl, liveSourceId: manual.liveSourceId || null, durationSec: manual.durationSec })
                }
              >
                Go live now
              </button>
              {insert.error && <div className="text-[11px] text-live">{(insert.error as Error).message}</div>}
            </div>
          </Panel>

          <Panel title="Live sources">
            <ul className="mb-2 flex flex-col gap-1">
              {live?.liveSources.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-[11.5px]">
                  <span className="truncate text-ink-100">{s.name}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => deleteLive.mutate(s.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input className="field" placeholder="Name" value={ls.name} onChange={(e) => setLs({ ...ls, name: e.target.value })} />
              <input className="field" placeholder="https://…/index.m3u8" value={ls.hlsUrl} onChange={(e) => setLs({ ...ls, hlsUrl: e.target.value })} />
              <button className="btn btn-sm" disabled={!ls.name || !ls.hlsUrl} onClick={() => createLive.mutate({ channelId: channel, ...ls })}>
                Add
              </button>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Program library (auto-fill rotation)">
        <table className="data mb-3">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Duration</th>
              <th>Premium</th>
              <th>Rotation</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {programs?.programs
              .filter((p) => p.channelId === channel)
              .map((p) => (
                <tr key={p.id}>
                  <td className="text-ink-50">
                    {p.title} {p.isDevData && <span className="chip ml-1">dev data</span>}
                  </td>
                  <td className="mono text-[10.5px]">{p.mediaType}</td>
                  <td className="mono text-[10.5px]">{formatDurationSec(p.durationSec)}</td>
                  <td>
                    <input type="checkbox" checked={p.isPremium} onChange={(e) => patchProgram.mutate({ id: p.id, body: { isPremium: e.target.checked } })} />
                  </td>
                  <td>
                    <input type="checkbox" checked={p.inRotation} onChange={(e) => patchProgram.mutate({ id: p.id, body: { inRotation: e.target.checked } })} />
                  </td>
                  <td className="text-right">
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteProgram.mutate(p.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        <div className="grid gap-2 md:grid-cols-6">
          <input className="field md:col-span-2" placeholder="Title" value={prog.title} onChange={(e) => setProg({ ...prog, title: e.target.value })} />
          <input className="field md:col-span-2" placeholder="Media URL (MP4 or HLS)" value={prog.mediaUrl} onChange={(e) => setProg({ ...prog, mediaUrl: e.target.value })} />
          <input className="field" placeholder="Poster URL" value={prog.posterUrl} onChange={(e) => setProg({ ...prog, posterUrl: e.target.value })} />
          <input className="field" type="number" placeholder="Duration s" value={prog.durationSec} onChange={(e) => setProg({ ...prog, durationSec: Number(e.target.value) })} />
          <label className="flex items-center gap-2 text-[11px] text-ink-300">
            <input type="checkbox" checked={prog.isPremium} onChange={(e) => setProg({ ...prog, isPremium: e.target.checked })} /> premium
          </label>
          <button
            className="btn btn-primary md:col-span-2"
            disabled={!prog.title || !prog.mediaUrl}
            onClick={() => createProgram.mutate({ channelId: channel, title: prog.title, mediaUrl: prog.mediaUrl, posterUrl: prog.posterUrl || null, durationSec: prog.durationSec, isPremium: prog.isPremium, mediaType: prog.mediaUrl.includes(".m3u8") ? "LIVE_HLS" : "VOD", description: prog.description || null })}
          >
            Add program
          </button>
        </div>
      </Panel>
    </div>
  );
}
