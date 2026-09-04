import { asc } from "drizzle-orm";
import { route } from "@/server/route";
import { json, parseBody, assertSameOrigin } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { placementInputSchema } from "@/server/admin/schemas";
import { audit } from "@/server/audit";
import { publish } from "@/server/realtime/bus";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  const placements = await db().select().from(schema.placements).orderBy(asc(schema.placements.sortOrder));
  return json({ placements });
});

/** Create a placement (or replace all fields of an existing id). */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  const input = await parseBody(req, placementInputSchema);
  const values = { ...input, transform: input.transform ?? null, meshName: input.meshName ?? null, description: input.description ?? null, updatedAt: new Date() };
  const [row] = await db()
    .insert(schema.placements)
    .values(values)
    .onConflictDoUpdate({ target: schema.placements.id, set: values })
    .returning();
  await audit({ type: "ADMIN", id: admin.adminId }, "placement.upsert", { type: "placement", id: row.id }, { name: row.name });
  publish({ type: "placement.updated", placementId: row.id });
  publish({ type: "placements.updated" });
  return json({ placement: row }, { status: 201 });
});
