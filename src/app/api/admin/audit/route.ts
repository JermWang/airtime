import { z } from "zod";
import { desc } from "drizzle-orm";
import { route } from "@/server/route";
import { json, parseQuery } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { db, schema } from "@/server/db/client";

export const dynamic = "force-dynamic";

const query = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });

export const GET = route(async (req) => {
  await requireAdmin();
  const { limit } = parseQuery(req, query);
  const logs = await db().select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.createdAt)).limit(limit);
  return json({ logs });
});
