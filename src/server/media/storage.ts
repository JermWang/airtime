import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../env";

/**
 * Storage abstraction. Creatives are written to controlled storage and served
 * from a controlled origin – never from an advertiser-supplied URL.
 *
 *   local → ./storage/<key>, served by /media/[...key] with strict headers
 *   s3    → any S3-compatible bucket (AWS S3, R2, MinIO) behind a CDN
 */
export interface StorageProvider {
  readonly kind: "local" | "s3";
  put(key: string, bytes: Buffer, contentType: string): Promise<{ url: string }>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

const SAFE_KEY = /^[a-z0-9]+(?:\/[a-z0-9][a-z0-9._-]*)*$/i;

export function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error("Unsafe storage key");
}

class LocalStorageProvider implements StorageProvider {
  readonly kind = "local" as const;
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertSafeKey(key);
    const abs = path.resolve(this.root, key);
    if (!abs.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Path escape");
    return abs;
  }

  async put(key: string, bytes: Buffer, _contentType: string): Promise<{ url: string }> {
    const abs = this.resolve(key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, bytes);
    return { url: this.publicUrl(key) };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.resolve(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch {
      /* already gone */
    }
  }

  publicUrl(key: string): string {
    return `/media/${key}`;
  }
}

/**
 * S3-compatible provider using AWS Signature V4 over plain fetch, so no SDK is
 * required. Works with AWS S3, Cloudflare R2 and MinIO.
 */
class S3StorageProvider implements StorageProvider {
  readonly kind = "s3" as const;
  constructor(
    private readonly cfg: { bucket: string; region: string; endpoint: string; accessKeyId: string; secretAccessKey: string; publicBaseUrl: string },
  ) {}

  private async sign(method: string, key: string, body: Buffer | null, contentType?: string): Promise<{ url: string; headers: Record<string, string> }> {
    const { createHash, createHmac } = await import("node:crypto");
    const host = new URL(this.cfg.endpoint).host;
    const url = `${this.cfg.endpoint.replace(/\/$/, "")}/${this.cfg.bucket}/${key}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash("sha256").update(body ?? Buffer.alloc(0)).digest("hex");
    const headers: Record<string, string> = { host, "x-amz-date": amzDate, "x-amz-content-sha256": payloadHash };
    if (contentType) headers["content-type"] = contentType;
    const signedHeaders = Object.keys(headers).sort().join(";");
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map((h) => `${h}:${headers[h]}\n`)
      .join("");
    const canonicalRequest = [method, `/${this.cfg.bucket}/${key}`, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${dateStamp}/${this.cfg.region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
    const kDate = createHmac("sha256", `AWS4${this.cfg.secretAccessKey}`).update(dateStamp).digest();
    const kRegion = createHmac("sha256", kDate).update(this.cfg.region).digest();
    const kService = createHmac("sha256", kRegion).update("s3").digest();
    const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
    const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
    headers["authorization"] = `AWS4-HMAC-SHA256 Credential=${this.cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return { url, headers };
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<{ url: string }> {
    assertSafeKey(key);
    const { url, headers } = await this.sign("PUT", key, bytes, contentType);
    const res = await fetch(url, { method: "PUT", headers, body: new Uint8Array(bytes) });
    if (!res.ok) throw new Error(`S3 put failed: ${res.status}`);
    return { url: this.publicUrl(key) };
  }

  async get(key: string): Promise<Buffer | null> {
    assertSafeKey(key);
    const { url, headers } = await this.sign("GET", key, null);
    const res = await fetch(url, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 get failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    const { url, headers } = await this.sign("DELETE", key, null);
    await fetch(url, { method: "DELETE", headers });
  }

  publicUrl(key: string): string {
    return `${this.cfg.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }
}

let provider: StorageProvider | null = null;

export function storage(): StorageProvider {
  if (provider) return provider;
  const e = env();
  if (e.STORAGE_PROVIDER === "s3") {
    if (!e.STORAGE_S3_BUCKET || !e.STORAGE_S3_ENDPOINT || !e.STORAGE_S3_ACCESS_KEY_ID || !e.STORAGE_S3_SECRET_ACCESS_KEY || !e.STORAGE_PUBLIC_BASE_URL) {
      throw new Error("STORAGE_PROVIDER=s3 requires bucket, endpoint, credentials and STORAGE_PUBLIC_BASE_URL");
    }
    provider = new S3StorageProvider({
      bucket: e.STORAGE_S3_BUCKET,
      region: e.STORAGE_S3_REGION || "auto",
      endpoint: e.STORAGE_S3_ENDPOINT,
      accessKeyId: e.STORAGE_S3_ACCESS_KEY_ID,
      secretAccessKey: e.STORAGE_S3_SECRET_ACCESS_KEY,
      publicBaseUrl: e.STORAGE_PUBLIC_BASE_URL,
    });
  } else {
    provider = new LocalStorageProvider(path.resolve(process.cwd(), e.STORAGE_LOCAL_DIR));
  }
  return provider;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}
