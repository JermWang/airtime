import { z } from "zod";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { route } from "@/server/route";
import { json, parseBody, rateLimit, assertSameOrigin, HttpError } from "@/server/http";
import { db, schema } from "@/server/db/client";
import { signSession, cookieOptions, ADMIN_COOKIE } from "@/server/auth/session";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";

const body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });
const TTL = 12 * 3600;

export const POST = route(async (req) => {
  rateLimit(req, "admin-login", { limit: 10, windowSec: 300 });
  assertSameOrigin(req);
  const { email, password } = await parseBody(req, body);
  const [admin] = await db().select().from(schema.adminUsers).where(eq(schema.adminUsers.email, email.toLowerCase()));
  const ok = admin ? await bcrypt.compare(password, admin.passwordHash) : await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid");
  if (!admin || !ok) throw new HttpError(401, "Invalid credentials");
  await db().update(schema.adminUsers).set({ lastLoginAt: new Date() }).where(eq(schema.adminUsers.id, admin.id));
  const token = await signSession({ kind: "admin", adminId: admin.id, email: admin.email, role: admin.role }, TTL);
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, cookieOptions(TTL));
  await audit({ type: "ADMIN", id: admin.id }, "admin.login", null, { email: admin.email });
  return json({ ok: true, email: admin.email, role: admin.role });
});
