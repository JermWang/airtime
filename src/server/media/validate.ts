import { fileTypeFromBuffer } from "file-type";
import sharp, { type Metadata } from "sharp";
import { inspectMp4 } from "./mp4";
import type { Placement } from "../db/schema";

/**
 * Advertiser uploads are hostile input. Every file is:
 *   1. size-checked
 *   2. sniffed by magic bytes (never trusting the client's MIME/extension)
 *   3. cross-checked against the claimed extension
 *   4. decoded server-side for real dimensions / duration / codec
 *   5. images are re-encoded (strips metadata and any embedded payloads)
 */

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const VIDEO_MIMES = new Set(["video/mp4"]);
const VIDEO_CODECS = new Set(["avc1", "avc3", "av01"]);
const EXT_FOR_MIME: Record<string, string[]> = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "video/mp4": ["mp4", "m4v"],
};

export interface ValidatedFile {
  type: "IMAGE" | "VIDEO";
  bytes: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  durationSec: number | null;
  hasAudio: boolean;
  codec: string | null;
  warnings: string[];
}

export type ValidationResult = { ok: true; file: ValidatedFile } | { ok: false; errors: string[] };

export async function validateCreativeFile(bytes: Buffer, claimedName: string, placement: Placement): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (bytes.length === 0) return { ok: false, errors: ["Empty file"] };
  if (bytes.length > placement.maxFileBytes) {
    errors.push(`File is ${(bytes.length / 1024 / 1024).toFixed(1)} MB; this placement allows up to ${(placement.maxFileBytes / 1024 / 1024).toFixed(0)} MB`);
  }

  const sniffed = await fileTypeFromBuffer(bytes);
  if (!sniffed) return { ok: false, errors: [...errors, "Unrecognized file format"] };

  const claimedExt = (claimedName.split(".").pop() ?? "").toLowerCase();
  const allowedExts = EXT_FOR_MIME[sniffed.mime];
  if (!allowedExts) return { ok: false, errors: [...errors, `Unsupported format ${sniffed.mime}. Use PNG, JPEG, WebP or H.264 MP4.`] };
  if (claimedExt && !allowedExts.includes(claimedExt)) {
    errors.push(`File content is ${sniffed.mime} but the extension is .${claimedExt}`);
  }

  if (IMAGE_MIMES.has(sniffed.mime)) {
    if (!placement.mediaTypes.includes("IMAGE") && !placement.mediaTypes.includes("LOGO")) {
      return { ok: false, errors: [...errors, "This placement does not accept images"] };
    }
    let meta: Metadata;
    try {
      meta = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    } catch {
      return { ok: false, errors: [...errors, "Image could not be decoded"] };
    }
    if (!meta.width || !meta.height) return { ok: false, errors: [...errors, "Image has no dimensions"] };
    if (meta.pages && meta.pages > 1) errors.push("Animated images are not supported");
    if (errors.length) return { ok: false, errors };

    let pipeline = sharp(bytes, { limitInputPixels: 40_000_000 }).rotate();
    let width = meta.width;
    let height = meta.height;
    if (width > placement.maxWidth || height > placement.maxHeight) {
      pipeline = pipeline.resize({ width: placement.maxWidth, height: placement.maxHeight, fit: "inside", withoutEnlargement: true });
      const scale = Math.min(placement.maxWidth / width, placement.maxHeight / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      warnings.push(`Image downscaled to ${width}×${height} to fit the placement`);
    }
    let out: Buffer;
    let ext: string;
    if (sniffed.mime === "image/png") {
      out = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      ext = "png";
    } else if (sniffed.mime === "image/webp") {
      out = await pipeline.webp({ quality: 90 }).toBuffer();
      ext = "webp";
    } else {
      out = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
      ext = "jpg";
    }
    return {
      ok: true,
      file: { type: "IMAGE", bytes: out, mimeType: sniffed.mime, extension: ext, width, height, durationSec: null, hasAudio: false, codec: null, warnings },
    };
  }

  if (VIDEO_MIMES.has(sniffed.mime)) {
    if (!placement.mediaTypes.includes("VIDEO")) return { ok: false, errors: [...errors, "This placement does not accept video"] };
    const info = inspectMp4(bytes);
    if (!info) return { ok: false, errors: [...errors, "MP4 container could not be parsed (missing moov atom?)"] };
    if (!info.videoCodec || !VIDEO_CODECS.has(info.videoCodec)) errors.push(`Video codec ${info.videoCodec ?? "unknown"} is not supported. Encode as H.264 (avc1) or AV1.`);
    if (!info.width || !info.height) errors.push("Video has no visual track");
    if (info.width > placement.maxWidth || info.height > placement.maxHeight) errors.push(`Video is ${info.width}×${info.height}; maximum is ${placement.maxWidth}×${placement.maxHeight}`);
    if (info.durationSec <= 0.5) errors.push("Video is too short");
    if (placement.maxCreativeSec > 0 && info.durationSec > placement.maxCreativeSec + 0.5) errors.push(`Video is ${info.durationSec.toFixed(1)}s; this surface accepts clips up to ${placement.maxCreativeSec}s, looped for as long as you hold it`);
    if (info.hasAudio && !placement.allowsAudio) warnings.push("This placement plays muted; the audio track will be ignored");
    if (errors.length) return { ok: false, errors };
    return {
      ok: true,
      file: {
        type: "VIDEO",
        bytes,
        mimeType: "video/mp4",
        extension: "mp4",
        width: info.width,
        height: info.height,
        durationSec: Math.round(info.durationSec * 1000) / 1000,
        hasAudio: info.hasAudio,
        codec: info.videoCodec,
        warnings,
      },
    };
  }

  return { ok: false, errors: [...errors, "Unsupported file type"] };
}

/** Ticker / lower-third text creatives. */
export function validateTextCreative(text: string, maxLen = 140): { ok: true; text: string } | { ok: false; errors: string[] } {
  // Strip control characters and collapse whitespace; no markup of any kind is interpreted downstream.
  const cleaned = text
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return { ok: false, errors: ["Text is empty"] };
  if (cleaned.length > maxLen) return { ok: false, errors: [`Text is ${cleaned.length} characters; maximum is ${maxLen}`] };
  return { ok: true, text: cleaned };
}

export function validateClickUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return u.toString().slice(0, 2048);
  } catch {
    return null;
  }
}
