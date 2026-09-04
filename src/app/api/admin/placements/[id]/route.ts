import { eq } from "drizzle-orm";
import { route, type Params } from "@/server/route";
import { json, parseBody, assertSameOrigin, notFound } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { placementPatchSchema } from "@/server/admin/schemas";
import { audit } from "@/server/audit";
import { publish } from "@/server/realtime/bus";

export const dynamic = "force-dynamic";

export const PATCH = route<Params<{ id: string }>>(async (req, { params }) => {
  assertSameOrigin(req);
  const { id } = await params;
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  const input = await parseBody(req, placementPatchSchema);
  const [row] = await db()
    .update(schema.placements)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(schema.placements.id, id))
    .returning();
  if (!row) notFound();
  await audit({ type: "ADMIN", id: admin.adminId }, "placement.update", { type: "placement", id }, input as Record<string, unknown>);
  publish({ type: "placement.updated", placementId: id });
  publish({ type: "placements.updated" });
  return json({ placement: row });
});

export const DELETE = route<Params<{ id: string }>>(async (req, { params }) => {
  assertSameOrigin(req);
  const { id } = await params;
  const admin = await requireAdmin(["OWNER"]);
  // Placements with history are deactivated rather than deleted to keep AirLogs intact.
  const [row] = await db().update(schema.placements).set({ isActive: false, updatedAt: new Date() }).where(eq(schema.placements.id, id)).returning();
  if (!row) notFound();
  await audit({ type: "ADMIN", id: admin.adminId }, "placement.deactivate", { type: "placement", id });
  publish({ type: "placements.updated" });
  return json({ placement: row });
});
