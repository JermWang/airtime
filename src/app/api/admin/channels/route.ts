import { eq } from "drizzle-orm";
import { route } from "@/server/route";
import { json, parseBody, assertSameOrigin } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { channelInputSchema } from "@/server/admin/schemas";
import { audit } from "@/server/audit";
import { ensureScheduleHorizon } from "@/server/broadcast/schedule";
import { publish } from "@/server/realtime/bus";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  const channels = await db().select().from(schema.channels).orderBy(schema.channels.sortOrder);
  return json({ channels });
});

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  const input = await parseBody(req, channelInputSchema);
  const [row] = await db()
    .insert(schema.channels)
    .values(input)
    .onConflictDoUpdate({ target: schema.channels.id, set: { ...input } })
    .returning();
  await audit({ type: "ADMIN", id: admin.adminId }, "channel.upsert", { type: "channel", id: row.id }, input);
  if (row.isActive) await ensureScheduleHorizon(row.id);
  publish({ type: "schedule.updated", channelId: row.id });
  return json({ channel: row }, { status: 201 });
});

export const PATCH = route(async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  const input = await parseBody(req, channelInputSchema.partial().required({ id: true }));
  const { id, ...set } = input;
  const [row] = await db().update(schema.channels).set(set).where(eq(schema.channels.id, id)).returning();
  await audit({ type: "ADMIN", id: admin.adminId }, "channel.update", { type: "channel", id }, set);
  if (row?.isActive) await ensureScheduleHorizon(row.id);
  publish({ type: "schedule.updated", channelId: id });
  return json({ channel: row });
});
