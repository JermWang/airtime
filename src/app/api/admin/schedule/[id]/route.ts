import { route, type Params } from "@/server/route";
import { json, assertSameOrigin } from "@/server/http";
import { requireAdmin } from "@/server/auth/session";
import { endBlockNow, deleteBlocks } from "@/server/broadcast/schedule";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";

/** End the block now (returns to scheduled programming). */
export const POST = route<Params<{ id: string }>>(async (req, { params }) => {
  assertSameOrigin(req);
  const { id } = await params;
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  await endBlockNow(id);
  await audit({ type: "ADMIN", id: admin.adminId }, "schedule.end_block", { type: "programBlock", id });
  return json({ ok: true });
});

export const DELETE = route<Params<{ id: string }>>(async (req, { params }) => {
  assertSameOrigin(req);
  const { id } = await params;
  const admin = await requireAdmin(["OWNER", "OPERATOR"]);
  await deleteBlocks([id]);
  await audit({ type: "ADMIN", id: admin.adminId }, "schedule.delete_block", { type: "programBlock", id });
  return json({ ok: true });
});
