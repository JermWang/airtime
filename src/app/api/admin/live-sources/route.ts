import { z } from "zod";
import { asc } from "drizzle-orm";
import { route } from "@/server/route";
import { json, parseBody, assertSameOrigin } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";

const input = z.object({ channelId: z.string().min(1).max(32), name: z.string().min(1).max(120), hlsUrl: z.string().url().max(2048), isActive: z.boolean().default(true) });

export const GET = route(async () => {
  await requireAdmin();
  const liveSources = await db().select().from(schema.liveSources).orderBy(asc(schema.liveSources.createdAt));
  return json({ liveSources });
});

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  const body = await parseBody(req, input);
  const [row] = await db().insert(schema.liveSources).values(body).returning();
  await audit({ type: "ADMIN", id: admin.adminId }, "livesource.create", { type: "liveSource", id: row.id }, { name: row.name });
  return json({ liveSource: row }, { status: 201 });
});
