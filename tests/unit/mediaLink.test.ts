import { describe, expect, it } from "vitest";
import { fixedHlsDuration, isPrivateAddress, normalizeMediaUrl } from "@/server/media/link";
import { inspectWebmDuration } from "@/server/media/webm";

function element(id: number[], payload: Buffer): Buffer {
  if (payload.length >= 127) throw new Error("test helper only supports one-byte sizes");
  return Buffer.concat([Buffer.from(id), Buffer.from([0x80 | payload.length]), payload]);
}

function webmWithDuration(seconds: number): Buffer {
  const scale = element([0x2a, 0xd7, 0xb1], Buffer.from([0x0f, 0x42, 0x40]));
  const durationValue = Buffer.alloc(8);
  durationValue.writeDoubleBE(seconds * 1000);
  const duration = element([0x44, 0x89], durationValue);
  const info = element([0x15, 0x49, 0xa9, 0x66], Buffer.concat([scale, duration]));
  return element([0x18, 0x53, 0x80, 0x67], info);
}

describe("linked-media safety", () => {
  it("blocks private and special-purpose network addresses", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1"]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    expect(isPrivateAddress("1.1.1.1")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("only accepts credential-free standard-port HTTPS media URLs", () => {
    expect(normalizeMediaUrl("http://cdn.example/video.mp4").ok).toBe(false);
    expect(normalizeMediaUrl("https://user:pass@cdn.example/video.mp4").ok).toBe(false);
    expect(normalizeMediaUrl("https://cdn.example:8443/video.mp4").ok).toBe(false);
    expect(normalizeMediaUrl("https://cdn.example/video.mp4#fragment")).toMatchObject({ ok: true });
  });

  it("rejects live HLS windows and measures only finished playlists", () => {
    const live = "#EXTM3U\n#EXTINF:5.0,\na.ts\n#EXTINF:5.0,\nb.ts\n";
    const vod = `${live}#EXT-X-ENDLIST\n`;
    expect(fixedHlsDuration(live)).toBeNull();
    expect(fixedHlsDuration(vod)).toBe(10);
  });

  it("reads a WebM Segment Info duration", () => {
    expect(inspectWebmDuration(webmWithDuration(30))).toBeCloseTo(30);
    expect(inspectWebmDuration(Buffer.from("not webm"))).toBeNull();
  });
});
