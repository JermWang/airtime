import { describe, it, expect } from "vitest";
import { inspectMp4 } from "@/server/media/mp4";

/** Minimal ISO-BMFF builder for tests. */
function box(type: string, ...payload: Buffer[]): Buffer {
  const body = Buffer.concat(payload);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + body.length, 0);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, body]);
}
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const u16 = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
};
const zeros = (n: number) => Buffer.alloc(n);

function sample(opts: { width: number; height: number; durationSec: number; codec: string; audio: boolean }): Buffer {
  const ftyp = box("ftyp", Buffer.from("isom", "latin1"), u32(512), Buffer.from("isomavc1mp42", "latin1"));
  const timescale = 1000;
  const mvhd = box("mvhd", zeros(4), u32(0), u32(0), u32(timescale), u32(opts.durationSec * timescale), zeros(80));
  const visualEntry = box(opts.codec, zeros(6), u16(1), zeros(16), u16(opts.width), u16(opts.height), zeros(50));
  const stsdV = box("stsd", zeros(4), u32(1), visualEntry);
  const trakV = box("trak", box("tkhd", zeros(84)), box("mdia", box("hdlr", zeros(8), Buffer.from("vide", "latin1"), zeros(12)), box("minf", box("stbl", stsdV))));
  const audioEntry = box("mp4a", zeros(6), u16(1), zeros(20));
  const trakA = box("trak", box("tkhd", zeros(84)), box("mdia", box("hdlr", zeros(8), Buffer.from("soun", "latin1"), zeros(12)), box("minf", box("stbl", box("stsd", zeros(4), u32(1), audioEntry)))));
  const moov = box("moov", mvhd, trakV, ...(opts.audio ? [trakA] : []));
  return Buffer.concat([ftyp, moov, box("mdat", zeros(16))]);
}

describe("mp4 inspector", () => {
  it("reads duration, dimensions, codec and audio presence", () => {
    const info = inspectMp4(sample({ width: 1280, height: 720, durationSec: 30, codec: "avc1", audio: true }));
    expect(info).not.toBeNull();
    expect(info!.durationSec).toBe(30);
    expect(info!.width).toBe(1280);
    expect(info!.height).toBe(720);
    expect(info!.videoCodec).toBe("avc1");
    expect(info!.hasAudio).toBe(true);
    expect(info!.brands).toContain("isom");
  });

  it("detects silent files and other codecs", () => {
    const info = inspectMp4(sample({ width: 640, height: 360, durationSec: 5, codec: "hvc1", audio: false }));
    expect(info!.hasAudio).toBe(false);
    expect(info!.videoCodec).toBe("hvc1");
  });

  it("rejects buffers without a moov atom", () => {
    expect(inspectMp4(Buffer.from("not an mp4 at all"))).toBeNull();
    expect(inspectMp4(box("ftyp", Buffer.from("isom"), u32(0)))).toBeNull();
  });
});
