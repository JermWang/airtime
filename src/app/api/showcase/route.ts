import { asc, eq } from "drizzle-orm";
import { route } from "@/server/route";
import { json } from "@/server/http";
import { db, schema } from "@/server/db/client";

export const dynamic = "force-dynamic";

/**
 * House showcase cards for surfaces nobody has booked. Always marked EXAMPLE in
 * the UI; never part of the paid queue.
 */
export const GET = route(async () => {
  const showcase = await db()
    .select()
    .from(schema.showcaseCreatives)
    .where(eq(schema.showcaseCreatives.isActive, true))
    .orderBy(asc(schema.showcaseCreatives.sortOrder));
  return json({ showcase });
});
