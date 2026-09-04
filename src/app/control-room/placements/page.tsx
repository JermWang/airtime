"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useAdminPlacements, useAdminMutation } from "@/components/control-room/adminApi";
import { Panel, Field } from "@/components/control-room/ui";
import type { EditorTransform } from "@/components/control-room/PlacementEditor";
import { api, type PlacementDto } from "@/lib/api";
import { formatWei, cn } from "@/lib/format";

const PlacementEditor = dynamic(() => import("@/components/control-room/PlacementEditor").then((m) => m.PlacementEditor), { ssr: false });

const EMPTY: Omit<PlacementDto, "sortOrder"> & { sortOrder: number } = {
  id: "",
  channelId: "MAIN",
  name: "",
  description: "",
  type: "ENVIRONMENT",
  kind: "billboard",
  aspectRatio: "16:9",
  mediaTypes: ["IMAGE"],
  minDurationSec: 300,
  maxDurationSec: 3600,
  durationOptionsSec: [300, 900, 1800, 3600],
  basePriceWei: "1000000000000000",
  priceMultiplierBps: 10000,
  pricingRules: { mode: "FIXED", unitSeconds: 900, durationExponentBps: 10000, timeOfDay: [], premiumProgramMultiplierBps: 10000, demand: { enabled: false, maxMultiplierBps: 10000 }, proximity: [] },
  availability: { inventoryMode: "CONTINUOUS", slotSeconds: 300, leadTimeSec: 120, horizonHours: 48, hoursUtc: null },
  lane: "",
  ownsMainStream: false,
  meshName: null,
  transform: { position: [0, 2, 0], rotation: [0, 0, 0], scale: [2, 1.125, 1] },
  material: { emissiveIntensity: 1, fit: "FILL", idleKind: "house" },
  maxWidth: 1920,
  maxHeight: 1080,
  maxFileBytes: 8 * 1024 * 1024,
  allowsAudio: false,
  allowsClickThrough: false,
  requiresModeration: false,
  isActive: true,
  sortOrder: 50,
};

export default function PlacementsPage() {
  const { data } = useAdminPlacements();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<PlacementDto>(EMPTY as PlacementDto);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<Record<string, EditorTransform>>({});
  const [pickMode, setPickMode] = useState(false);
  const [meshNames, setMeshNames] = useState<string[]>([]);

  useEffect(() => {
    void fetch("/models/studio.meshes.json")
      .then((r) => r.json())
      .then((j: { meshes: string[] }) => setMeshNames(j.meshes))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const p = data?.placements.find((x) => x.id === selectedId);
    if (p) {
      setForm({ ...p });
      setIsNew(false);
    }
  }, [selectedId, data]);

  const save = useAdminMutation((body: PlacementDto) =>
    isNew
      ? api("/api/admin/placements", { method: "POST", json: body })
      : api(`/api/admin/placements/${body.id}`, {
          method: "PATCH",
          json: (() => {
            const { id: _id, ...rest } = body;
            return rest;
          })(),
        }),
  );
  const deactivate = useAdminMutation((id: string) => api(`/api/admin/placements/${id}`, { method: "DELETE" }));

  const placementsForEditor = useMemo(() => {
    const list = (data?.placements ?? []).map((p) => (p.id === form.id ? form : p));
    if (isNew && form.id) list.push(form);
    return list;
  }, [data, form, isNew]);

  const set = <K extends keyof PlacementDto>(k: K, v: PlacementDto[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Panel
          title="Placements"
          actions={
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                setSelectedId(null);
                setIsNew(true);
                setForm({ ...(EMPTY as PlacementDto), id: "" });
              }}
            >
              New
            </button>
          }
        >
          <ul className="flex flex-col gap-0.5">
            {data?.placements.map((p) => (
              <li key={p.id}>
                <button className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-white/5", selectedId === p.id && "bg-white/10")} onClick={() => setSelectedId(p.id)}>
                  <div className="min-w-0">
                    <div className={cn("truncate text-[12.5px]", p.isActive ? "text-ink-50" : "text-ink-500 line-through")}>{p.name}</div>
                    <div className="mono truncate text-[9.5px] uppercase tracking-[0.12em] text-ink-400">
                      {p.id} · {p.meshName ?? "transform"}
                    </div>
                  </div>
                  <span className="mono text-[10px] text-ink-300">{formatWei(p.basePriceWei)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="flex flex-col gap-4">
          <PlacementEditor
            placements={placementsForEditor}
            selectedId={isNew ? form.id || null : selectedId}
            onSelect={(id) => {
              if (id) setSelectedId(id);
            }}
            onTransform={(id, t) => {
              setDraft((d) => ({ ...d, [id]: t }));
              if (id === form.id) set("transform", t);
            }}
            onPickMesh={(mesh) => {
              set("meshName", mesh);
              setPickMode(false);
            }}
            pickMode={pickMode}
            draft={draft}
          />

          {(selectedId || isNew) && (
            <Panel
              title={isNew ? "New placement" : `Edit ${form.id}`}
              actions={
                <>
                  {!isNew && (
                    <button className="btn btn-sm btn-danger" onClick={() => deactivate.mutate(form.id)}>
                      Deactivate
                    </button>
                  )}
                  <button className="btn btn-sm btn-primary" disabled={save.isPending || !form.id || !form.name || !form.lane} onClick={() => save.mutate(form)}>
                    {save.isPending ? "Saving…" : "Save"}
                  </button>
                </>
              }
            >
              {save.error && <div className="mb-3 text-[11px] text-live">{(save.error as Error).message}</div>}
              {save.isSuccess && <div className="mb-3 text-[11px] text-signal">Saved. The studio updates live.</div>}
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Placement id" hint="UPPER_SNAKE_CASE; immutable">
                  <input className="field" value={form.id} disabled={!isNew} onChange={(e) => set("id", e.target.value.toUpperCase())} />
                </Field>
                <Field label="Name">
                  <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} />
                </Field>
                <Field label="Channel">
                  <input className="field" value={form.channelId} onChange={(e) => set("channelId", e.target.value)} />
                </Field>
                <Field label="Type">
                  <select className="field" value={form.type} onChange={(e) => set("type", e.target.value as PlacementDto["type"])}>
                    {["FULLSCREEN", "OVERLAY", "ENVIRONMENT", "SPONSORSHIP"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Kind" hint="commercial, lower_third, ticker, sponsor_bug, billboard, …">
                  <input className="field" value={form.kind} onChange={(e) => set("kind", e.target.value)} />
                </Field>
                <Field label="Aspect ratio">
                  <input className="field" value={form.aspectRatio} onChange={(e) => set("aspectRatio", e.target.value)} />
                </Field>
                <Field label="Media types">
                  <div className="flex gap-2">
                    {(["IMAGE", "VIDEO", "TEXT", "LOGO"] as const).map((m) => (
                      <label key={m} className="flex items-center gap-1 text-[11px] text-ink-300">
                        <input type="checkbox" checked={form.mediaTypes.includes(m)} onChange={(e) => set("mediaTypes", e.target.checked ? [...form.mediaTypes, m] : form.mediaTypes.filter((x) => x !== m))} /> {m}
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Lane" hint="reservations in one lane never overlap">
                  <input className="field" value={form.lane} onChange={(e) => set("lane", e.target.value)} />
                </Field>
                <Field label="Owns main picture" hint="an airing campaign here replaces the main broadcast picture">
                  <label className="flex h-9 items-center gap-2 text-[11px] text-ink-300">
                    <input type="checkbox" checked={form.ownsMainStream} onChange={(e) => set("ownsMainStream", e.target.checked)} /> takes over the stream
                  </label>
                </Field>
                <Field label="Active">
                  <label className="flex h-9 items-center gap-2 text-[11px] text-ink-300">
                    <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} /> sellable
                  </label>
                </Field>

                <Field label="GLTF mesh" hint="bind to a named mesh, or leave empty for a transform-positioned surface">
                  <div className="flex gap-1">
                    <select className="field" value={form.meshName ?? ""} onChange={(e) => set("meshName", e.target.value || null)}>
                      <option value="">— transform-based —</option>
                      {meshNames.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                    <button className={cn("btn btn-sm shrink-0", pickMode && "bg-white/10")} onClick={() => setPickMode((v) => !v)}>
                      {pickMode ? "Picking…" : "Pick"}
                    </button>
                  </div>
                </Field>
                {!form.meshName && (
                  <Field label="Transform (x y z / rx ry rz / sx sy)" hint="drag the gizmo in the editor or type values">
                    <div className="grid grid-cols-3 gap-1">
                      {(["position", "rotation", "scale"] as const).map((k) =>
                        [0, 1, 2].map((i) =>
                          k === "scale" && i === 2 ? null : (
                            <input
                              key={`${k}${i}`}
                              className="field"
                              type="number"
                              step={0.05}
                              value={form.transform?.[k][i] ?? 0}
                              onChange={(e) => {
                                const t = form.transform ?? { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
                                const arr = [...t[k]] as [number, number, number];
                                arr[i] = Number(e.target.value);
                                set("transform", { ...t, [k]: arr });
                              }}
                            />
                          ),
                        ),
                      )}
                    </div>
                  </Field>
                )}
                <Field label="Emissive intensity">
                  <input className="field" type="number" step={0.1} value={form.material.emissiveIntensity} onChange={(e) => set("material", { ...form.material, emissiveIntensity: Number(e.target.value) })} />
                </Field>

                <Field label="Base price (wei)" hint={formatWei(form.basePriceWei || "0")}>
                  <input className="field" value={form.basePriceWei} onChange={(e) => set("basePriceWei", e.target.value.replace(/\D/g, ""))} />
                </Field>
                <Field label="Unit seconds">
                  <input className="field" type="number" value={form.pricingRules.unitSeconds} onChange={(e) => set("pricingRules", { ...form.pricingRules, unitSeconds: Number(e.target.value) })} />
                </Field>
                <Field label="Pricing mode">
                  <select className="field" value={form.pricingRules.mode} onChange={(e) => set("pricingRules", { ...form.pricingRules, mode: e.target.value as "FIXED" | "DYNAMIC" })}>
                    <option>FIXED</option>
                    <option>DYNAMIC</option>
                  </select>
                </Field>
                <Field label="Placement multiplier (bps)">
                  <input className="field" type="number" value={form.priceMultiplierBps} onChange={(e) => set("priceMultiplierBps", Number(e.target.value))} />
                </Field>
                <Field label="Premium program ×bps">
                  <input className="field" type="number" value={form.pricingRules.premiumProgramMultiplierBps} onChange={(e) => set("pricingRules", { ...form.pricingRules, premiumProgramMultiplierBps: Number(e.target.value) })} />
                </Field>
                <Field label="Demand max ×bps">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={form.pricingRules.demand.enabled} onChange={(e) => set("pricingRules", { ...form.pricingRules, demand: { ...form.pricingRules.demand, enabled: e.target.checked } })} />
                    <input className="field" type="number" value={form.pricingRules.demand.maxMultiplierBps} onChange={(e) => set("pricingRules", { ...form.pricingRules, demand: { ...form.pricingRules.demand, maxMultiplierBps: Number(e.target.value) } })} />
                  </div>
                </Field>
                <Field label="Time of day (JSON)" hint='[{"fromHourUtc":13,"toHourUtc":21,"multiplierBps":12500}]'>
                  <input className="field" defaultValue={JSON.stringify(form.pricingRules.timeOfDay)} onBlur={(e) => { try { set("pricingRules", { ...form.pricingRules, timeOfDay: JSON.parse(e.target.value) }); } catch { /* keep */ } }} />
                </Field>
                <Field label="Proximity (JSON)" hint='[{"withinMinutes":30,"multiplierBps":11000}]'>
                  <input className="field" defaultValue={JSON.stringify(form.pricingRules.proximity)} onBlur={(e) => { try { set("pricingRules", { ...form.pricingRules, proximity: JSON.parse(e.target.value) }); } catch { /* keep */ } }} />
                </Field>

                <Field label="Inventory mode">
                  <select className="field" value={form.availability.inventoryMode} onChange={(e) => set("availability", { ...form.availability, inventoryMode: e.target.value as "CONTINUOUS" | "AD_BREAK" })}>
                    <option>CONTINUOUS</option>
                    <option>AD_BREAK</option>
                  </select>
                </Field>
                <Field label="Slot grid (s)">
                  <input className="field" type="number" value={form.availability.slotSeconds} onChange={(e) => set("availability", { ...form.availability, slotSeconds: Number(e.target.value) })} />
                </Field>
                <Field label="Lead time (s) / horizon (h)">
                  <div className="flex gap-1">
                    <input className="field" type="number" value={form.availability.leadTimeSec} onChange={(e) => set("availability", { ...form.availability, leadTimeSec: Number(e.target.value) })} />
                    <input className="field" type="number" value={form.availability.horizonHours} onChange={(e) => set("availability", { ...form.availability, horizonHours: Number(e.target.value) })} />
                  </div>
                </Field>
                <Field label="Duration min / max (s)">
                  <div className="flex gap-1">
                    <input className="field" type="number" value={form.minDurationSec} onChange={(e) => set("minDurationSec", Number(e.target.value))} />
                    <input className="field" type="number" value={form.maxDurationSec} onChange={(e) => set("maxDurationSec", Number(e.target.value))} />
                  </div>
                </Field>
                <Field label="Duration options (s, comma)">
                  <input className="field" defaultValue={form.durationOptionsSec.join(",")} onBlur={(e) => set("durationOptionsSec", e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => n > 0))} />
                </Field>
                <Field label="Max creative (w×h / MB)">
                  <div className="flex gap-1">
                    <input className="field" type="number" value={form.maxWidth} onChange={(e) => set("maxWidth", Number(e.target.value))} />
                    <input className="field" type="number" value={form.maxHeight} onChange={(e) => set("maxHeight", Number(e.target.value))} />
                    <input className="field" type="number" value={Math.round(form.maxFileBytes / 1024 / 1024)} onChange={(e) => set("maxFileBytes", Number(e.target.value) * 1024 * 1024)} />
                  </div>
                </Field>
                <Field label="Rules">
                  <div className="flex flex-wrap gap-3 text-[11px] text-ink-300">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={form.allowsAudio} onChange={(e) => set("allowsAudio", e.target.checked)} /> audio
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={form.allowsClickThrough} onChange={(e) => set("allowsClickThrough", e.target.checked)} /> click-through
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={form.requiresModeration} onChange={(e) => set("requiresModeration", e.target.checked)} /> moderation
                    </label>
                  </div>
                </Field>
                <Field label="Description">
                  <input className="field" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
                </Field>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
