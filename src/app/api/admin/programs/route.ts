import { asc } from "drizzle-orm";
import { route } from "@/server/route";
import { json, parseBody, assertSameOrigin } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { programInputSchema } from "@/server/admin/schemas";
import { audit } from "@/server/audit";
import { ensureScheduleHorizon } from "@/server/broadcast/schedule";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  const programs = await db().select().from(schema.programs).orderBy(asc(schema.programs.createdAt));
  return json({ programs });
});

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  const input = await parseBody(req, programInputSchema);
  const [row] = await db().insert(schema.programs).values({ ...input, isDevData: false }).returning();
  await audit({ type: "ADMIN", id: admin.adminId }, "program.create", { type: "program", id: row.id }, { title: row.title });
  await ensureScheduleHorizon(row.channelId);
  return json({ program: row }, { status: 201 });
});
