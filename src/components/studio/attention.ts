import type { StationMode } from "@/lib/store";

/**
 * How brightly a surface reads, depending on what the viewer is doing.
 *
 * The studio has more than thirty lit surfaces. If they all burn at full
 * emissive the eye has nowhere to land, so brightness follows attention:
 *
 *   watch  - the programme is the subject; sold inventory stays legible, idle
 *            house monitors sink back into the set
 *   browse - everything that can be bought comes up together
 *   focus  - the chosen surface holds, the rest of the room falls away
 *
 * This only scales emissive intensity. Nothing here decides what a surface
 * shows, and no placement is hidden: dimmed inventory is still clickable.
 */
export type SurfaceRole = "main" | "inventory" | "idle";

export function attentionFor(mode: StationMode, role: SurfaceRole, self: { focused?: boolean; hovered?: boolean; highlighted?: boolean } = {}): number {
  if (self.focused) return 1.2;
  if (self.hovered || self.highlighted) return 1.1;
  switch (mode) {
    case "browse":
      return role === "idle" ? 0.6 : 1;
    case "focus":
    case "preview":
      return role === "main" ? 0.55 : role === "inventory" ? 0.45 : 0.22;
    default:
      return role === "main" ? 1 : role === "inventory" ? 0.74 : 0.34;
  }
}

/** Seconds-to-target damping constant used for every attention change. */
export const ATTENTION_LAMBDA = 3.4;
