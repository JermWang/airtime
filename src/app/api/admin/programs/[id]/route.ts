import { eq } from "drizzle-orm";
import { route, type Params } from "@/server/route";
import { json, parseBody, assertSameOrigin, notFound } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { programInputSchema } from "@/server/admin/schemas";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";

export const PATCH = route<Params<{ id: string }>>(async (req, { params }) => {
  assertSameOrigin(req);
  const { id } = await params;
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  const input = await parseBody(req, programInputSchema.partial());
  const [row] = await db().update(schema.programs).set(input).where(eq(schema.programs.id, id)).returning();
  if (!row) notFound();
  await audit({ type: "ADMIN", id: admin.adminId }, "program.update", { type: "program", id }, input);
  return json({ program: row });
});

export const DELETE = route<Params<{ id: string }>>(async (req, { params }) => {
  assertSameOrigin(req);
  const { id } = await params;
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  await db().delete(schema.programs).where(eq(schema.programs.id, id));
  await audit({ type: "ADMIN", id: admin.adminId }, "program.delete", { type: "program", id });
  return json({ ok: true });
});
