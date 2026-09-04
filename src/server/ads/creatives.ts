import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { keccak256, toHex } from "viem";
import { db, schema } from "../db/client";
import { validateCreativeFile, validateTextCreative, validateClickUrl } from "../media/validate";
import { mediaProvider } from "../media/provider";
import { sanitizeFilename } from "../media/storage";
import { HttpError } from "../http";
import type { Creative, Placement } from "../db/schema";

/**
 * Creative service. A creative is bound to the wallet that uploaded it and to
 * a content hash; the hash is what gets signed into the quote and emitted on
 * chain, so the creative paid for is exactly the creative that airs.
 */

export async function loadActivePlacement(placementId: string): Promise<Placement> {
  const [placement] = await db().select().from(schema.placements).where(eq(schema.placements.id, placementId));
  if (!placement || !placement.isActive) throw new HttpError(404, "Placement not found");
  return placement;
}

export async function createCreativeFromUpload(input: {
  walletAddress: `0x${string}`;
  placementId: string;
  bytes: Buffer;
  filename: string;
  clickUrl?: string | null;
}): Promise<Creative> {
  const placement = await loadActivePlacement(input.placementId);
  const filename = sanitizeFilename(input.filename);
  const result = await validateCreativeFile(input.bytes, filename, placement);

  if (!result.ok) {
    const [row] = await db()
      .insert(schema.creatives)
      .values({
        walletAddress: input.walletAddress,
        type: "IMAGE",
        status: "INVALID",
        originalFilename: filename,
        sizeBytes: input.bytes.length,
        contentHash: createHash("sha256").update(input.bytes).digest("hex"),
        creativeHash: keccak256(input.bytes),
        validationErrors: result.errors,
        metadata: { placementId: placement.id },
      })
      .returning();
    return row;
  }

  const { file } = result;
  const contentHash = createHash("sha256").update(file.bytes).digest("hex");
  const creativeHash = keccak256(file.bytes);
  const id = randomUUID();
  const key = `creatives/${input.walletAddress.slice(2, 10)}/${id}`;
  const processed = file.type === "IMAGE" ? await mediaProvider().processImage({ key, bytes: file.bytes, mimeType: file.mimeType, extension: file.extension }) : await mediaProvider().processVideo({ key, bytes: file.bytes, mimeType: file.mimeType, extension: file.extension });

  const clickUrl = placement.allowsClickThrough ? validateClickUrl(input.clickUrl) : null;

  const [row] = await db()
    .insert(schema.creatives)
    .values({
      id,
      walletAddress: input.walletAddress,
      type: file.type === "IMAGE" && placement.mediaTypes.includes("LOGO") && !placement.mediaTypes.includes("IMAGE") ? "LOGO" : file.type,
      status: "VALID",
      originalFilename: filename,
      storageKey: processed.storageKey,
      url: processed.url,
      posterUrl: processed.posterUrl,
      mimeType: file.mimeType,
      extension: file.extension,
      sizeBytes: file.bytes.length,
      width: file.width,
      height: file.height,
      durationSec: file.durationSec !== null ? file.durationSec.toString() : null,
      hasAudio: file.hasAudio,
      codec: file.codec,
      contentHash,
      creativeHash,
      clickUrl,
      validationErrors: [],
      metadata: { placementId: placement.id, warnings: file.warnings, renditions: processed.renditions },
    })
    .returning();
  return row;
}

export async function createTextCreative(input: { walletAddress: `0x${string}`; placementId: string; text: string; clickUrl?: string | null }): Promise<Creative> {
  const placement = await loadActivePlacement(input.placementId);
  if (!placement.mediaTypes.includes("TEXT")) throw new HttpError(400, "This placement does not accept text creatives");
  const result = validateTextCreative(input.text);
  if (!result.ok) throw new HttpError(400, result.errors.join("; "), result.errors);
  const bytes = Buffer.from(result.text, "utf8");
  const [row] = await db()
    .insert(schema.creatives)
    .values({
      walletAddress: input.walletAddress,
      type: "TEXT",
      status: "VALID",
      textContent: result.text,
      sizeBytes: bytes.length,
      contentHash: createHash("sha256").update(bytes).digest("hex"),
      creativeHash: keccak256(toHex(bytes)),
      clickUrl: placement.allowsClickThrough ? validateClickUrl(input.clickUrl) : null,
      metadata: { placementId: placement.id },
    })
    .returning();
  return row;
}

export async function getOwnedCreative(id: string, walletAddress: string): Promise<Creative> {
  const [row] = await db()
    .select()
    .from(schema.creatives)
    .where(and(eq(schema.creatives.id, id), eq(schema.creatives.walletAddress, walletAddress)));
  if (!row) throw new HttpError(404, "Creative not found");
  return row;
}

/** Whether a creative may be sold on a placement right now. */
export function creativeSellable(creative: Creative, placement: Placement): { ok: true } | { ok: false; reason: string } {
  if (creative.status === "INVALID") return { ok: false, reason: "Creative failed validation" };
  if (creative.status === "REJECTED") return { ok: false, reason: "Creative was rejected by moderation" };
  if (placement.requiresModeration && creative.status !== "APPROVED") return { ok: false, reason: "Creative is awaiting review" };
  if (!placement.mediaTypes.includes(creative.type)) return { ok: false, reason: `Placement does not accept ${creative.type}` };
  return { ok: true };
}

/** Public projection: never leak storage keys or wallet internals. */
export function publicCreative(c: Creative | null | undefined) {
  if (!c) return null;
  return {
    id: c.id,
    type: c.type,
    status: c.status,
    url: c.url,
    posterUrl: c.posterUrl,
    mimeType: c.mimeType,
    width: c.width,
    height: c.height,
    durationSec: c.durationSec ? Number(c.durationSec) : null,
    hasAudio: c.hasAudio,
    textContent: c.textContent,
    clickUrl: c.clickUrl,
    creativeHash: c.creativeHash,
    contentHash: c.contentHash,
    validationErrors: c.validationErrors,
    warnings: (c.metadata as { warnings?: string[] }).warnings ?? [],
    createdAt: c.createdAt,
  };
}
