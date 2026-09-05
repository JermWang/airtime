import { route } from "@/server/route";
import { json, rateLimit, assertSameOrigin, HttpError, parseFormDataLimited } from "@/server/http";
import { requireWallet } from "@/server/auth/session";
import { verifyUploadTicket } from "@/server/auth/uploadTicket";
import { createCreativeFromUpload, publicCreative, loadActivePlacement } from "@/server/ads/creatives";
import { MULTIPART_OVERHEAD_BYTES } from "@/lib/upload";

export const dynamic = "force-dynamic";

/** Multipart upload: file, placementId, ticket, clickUrl? */
export const POST = route(async (req) => {
  rateLimit(req, "upload", { limit: 20, windowSec: 60 });
  assertSameOrigin(req);
  const wallet = await requireWallet();

  // The signed intent travels in headers so the placement limit is known before
  // the multipart body is read. The stream itself is still counted, so a missing
  // or dishonest Content-Length cannot bypass the ceiling.
  const intendedPlacementId = req.headers.get("x-airtime-placement-id") ?? "";
  const intendedTicket = req.headers.get("x-airtime-upload-ticket") ?? "";
  if (!intendedPlacementId || !intendedTicket) throw new HttpError(400, "Upload intent headers are required");
  if (!verifyUploadTicket(intendedTicket, wallet.address, intendedPlacementId)) throw new HttpError(403, "Upload ticket is invalid or expired");
  const placement = await loadActivePlacement(intendedPlacementId);
  const form = await parseFormDataLimited(req, placement.maxFileBytes + MULTIPART_OVERHEAD_BYTES);
  const placementId = String(form.get("placementId") ?? "");
  const ticket = String(form.get("ticket") ?? "");
  const clickUrl = form.get("clickUrl") ? String(form.get("clickUrl")) : null;
  const file = form.get("file");
  if (!placementId || !ticket) throw new HttpError(400, "placementId and ticket are required");
  if (!(file instanceof File)) throw new HttpError(400, "file is required");
  if (placementId !== intendedPlacementId || ticket !== intendedTicket || !verifyUploadTicket(ticket, wallet.address, placementId)) throw new HttpError(403, "Upload intent does not match the request");
  if (file.size > placement.maxFileBytes) throw new HttpError(413, `File exceeds ${(placement.maxFileBytes / 1024 / 1024).toFixed(0)} MB`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const creative = await createCreativeFromUpload({ walletAddress: wallet.address, placementId, bytes, filename: file.name || "upload", clickUrl });
  return json({ creative: publicCreative(creative) }, { status: creative.status === "INVALID" ? 422 : 201 });
});
