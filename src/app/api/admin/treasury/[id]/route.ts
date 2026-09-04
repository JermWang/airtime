import { route, type Params } from "@/server/route";
import { json, assertSameOrigin } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { deleteTreasuryEntry, getTreasurySummary } from "@/server/treasury/treasury";

export const dynamic = "force-dynamic";

export const DELETE = route<Params<{ id: string }>>(async (req, { params }) => {
  assertSameOrigin(req);
  const { id } = await params;
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  await deleteTreasuryEntry(id, { type: "ADMIN", id: admin.adminId });
  return json({ ok: true, summary: await getTreasurySummary() });
});
