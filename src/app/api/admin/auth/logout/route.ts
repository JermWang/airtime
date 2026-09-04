import { cookies } from "next/headers";
import { route } from "@/server/route";
import { json, assertSameOrigin } from "@/server/http";
import { ADMIN_COOKIE, cookieOptions } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const store = await cookies();
  store.set(ADMIN_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
  return json({ ok: true });
});
