import { eq } from "drizzle-orm";
import { route, type Params } from "@/server/route";
import { json, assertSameOrigin } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";

export const DELETE = route<Params<{ id: string }>>(async (req, { params }) => {
  assertSameOrigin(req);
  const { id } = await params;
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  await db().delete(schema.liveSources).where(eq(schema.liveSources.id, id));
  await audit({ type: "ADMIN", id: admin.adminId }, "livesource.delete", { type: "liveSource", id });
  return json({ ok: true });
});
