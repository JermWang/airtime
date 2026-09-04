import { route } from "@/server/route";
import { json, rateLimit, assertSameOrigin, HttpError } from "@/server/http";
import { requireWallet } from "@/server/auth/session";
import { verifyUploadTicket } from "@/server/auth/uploadTicket";
import { createCreativeFromUpload, publicCreative, loadActivePlacement } from "@/server/ads/creatives";

export const dynamic = "force-dynamic";

/** Multipart upload: file, placementId, ticket, clickUrl? */
export const POST = route(async (req) => {
  rateLimit(req, "upload", { limit: 20, windowSec: 60 });
  assertSameOrigin(req);
  const wallet = await requireWallet();

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > 64 * 1024 * 1024) throw new HttpError(413, "Upload too large");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Expected multipart form data");
  }
  const placementId = String(form.get("placementId") ?? "");
  const ticket = String(form.get("ticket") ?? "");
  const clickUrl = form.get("clickUrl") ? String(form.get("clickUrl")) : null;
  const file = form.get("file");
  if (!placementId || !ticket) throw new HttpError(400, "placementId and ticket are required");
  if (!(file instanceof File)) throw new HttpError(400, "file is required");
  if (!verifyUploadTicket(ticket, wallet.address, placementId)) throw new HttpError(403, "Upload ticket is invalid or expired");

  const placement = await loadActivePlacement(placementId);
  if (file.size > placement.maxFileBytes) throw new HttpError(413, `File exceeds ${(placement.maxFileBytes / 1024 / 1024).toFixed(0)} MB`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const creative = await createCreativeFromUpload({ walletAddress: wallet.address, placementId, bytes, filename: file.name || "upload", clickUrl });
  return json({ creative: publicCreative(creative) }, { status: creative.status === "INVALID" ? 422 : 201 });
});
