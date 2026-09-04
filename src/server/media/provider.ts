import sharp from "sharp";
import { storage } from "./storage";

/**
 * MediaProvider – turns validated upload bytes into playback-ready renditions.
 *
 * The local provider stores the (already size-limited, re-encoded) original and
 * generates a poster for images. A hosted provider (Mux, Cloudflare Stream, an
 * ffmpeg worker) implements the same interface and can return HLS manifests
 * plus multiple renditions without touching the rest of the system.
 */
export interface Rendition {
  label: string; // "source" | "720p" | "hls"
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface ProcessedMedia {
  storageKey: string;
  url: string;
  posterUrl: string | null;
  renditions: Rendition[];
}

export interface MediaProvider {
  readonly kind: string;
  processImage(input: { key: string; bytes: Buffer; mimeType: string; extension: string }): Promise<ProcessedMedia>;
  processVideo(input: { key: string; bytes: Buffer; mimeType: string; extension: string }): Promise<ProcessedMedia>;
  remove(storageKey: string): Promise<void>;
}

class LocalMediaProvider implements MediaProvider {
  readonly kind = "local";

  async processImage({ key, bytes, mimeType, extension }: { key: string; bytes: Buffer; mimeType: string; extension: string }): Promise<ProcessedMedia> {
    const store = storage();
    const fullKey = `${key}.${extension}`;
    const { url } = await store.put(fullKey, bytes, mimeType);
    // Small poster/thumbnail for lists and AirLog receipts.
    const poster = await sharp(bytes).resize({ width: 640, height: 360, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    const posterKey = `${key}.poster.webp`;
    const { url: posterUrl } = await store.put(posterKey, poster, "image/webp");
    return { storageKey: fullKey, url, posterUrl, renditions: [{ label: "source", url, mimeType }] };
  }

  async processVideo({ key, bytes, mimeType, extension }: { key: string; bytes: Buffer; mimeType: string; extension: string }): Promise<ProcessedMedia> {
    const store = storage();
    const fullKey = `${key}.${extension}`;
    const { url } = await store.put(fullKey, bytes, mimeType);
    // Without a transcoder the source (already capped at 1080p / 60s / size limit)
    // is the single rendition. Hosted providers add HLS + lower renditions here.
    return { storageKey: fullKey, url, posterUrl: null, renditions: [{ label: "source", url, mimeType }] };
  }

  async remove(storageKey: string): Promise<void> {
    await storage().delete(storageKey);
  }
}

let provider: MediaProvider | null = null;

export function mediaProvider(): MediaProvider {
  if (!provider) provider = new LocalMediaProvider();
  return provider;
}
