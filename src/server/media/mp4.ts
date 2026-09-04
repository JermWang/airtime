/**
 * Minimal ISO-BMFF (MP4) inspector.
 *
 * We do not trust anything the browser tells us about an uploaded video, so the
 * server reads the container itself: duration (mvhd), visual track dimensions
 * (tkhd/stsd), codec four-cc and whether an audio track is present. No
 * decoding, no external binaries.
 */

export interface Mp4Info {
  durationSec: number;
  width: number;
  height: number;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
  brands: string[];
}

interface Box {
  type: string;
  start: number; // offset of box header
  size: number; // total size incl. header
  headerSize: number;
}

function readBoxes(buf: Buffer, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = buf.readUInt32BE(offset);
    const type = buf.toString("latin1", offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      const big = buf.readBigUInt64BE(offset + 8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) break;
      size = Number(big);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) break;
    boxes.push({ type, start: offset, size, headerSize });
    offset += size;
  }
  return boxes;
}

function findChild(buf: Buffer, parent: Box, type: string, extraSkip = 0): Box | undefined {
  return readBoxes(buf, parent.start + parent.headerSize + extraSkip, parent.start + parent.size).find((b) => b.type === type);
}

function children(buf: Buffer, parent: Box, extraSkip = 0): Box[] {
  return readBoxes(buf, parent.start + parent.headerSize + extraSkip, parent.start + parent.size);
}

const VISUAL_CODECS = new Set(["avc1", "avc3", "hvc1", "hev1", "av01", "vp09", "mp4v"]);
const AUDIO_CODECS = new Set(["mp4a", "Opus", "ac-3", "ec-3", "alac", "flac"]);

export function inspectMp4(buf: Buffer): Mp4Info | null {
  const top = readBoxes(buf, 0, buf.length);
  const ftyp = top.find((b) => b.type === "ftyp");
  const moov = top.find((b) => b.type === "moov");
  if (!ftyp || !moov) return null;

  const brands: string[] = [];
  for (let o = ftyp.start + 8; o + 4 <= ftyp.start + ftyp.size; o += 4) {
    if (o === ftyp.start + 12) continue; // minor version
    brands.push(buf.toString("latin1", o, o + 4).trim());
  }

  const mvhd = findChild(buf, moov, "mvhd");
  if (!mvhd) return null;
  const version = buf.readUInt8(mvhd.start + mvhd.headerSize);
  let timescale: number;
  let duration: number;
  if (version === 1) {
    timescale = buf.readUInt32BE(mvhd.start + mvhd.headerSize + 20);
    duration = Number(buf.readBigUInt64BE(mvhd.start + mvhd.headerSize + 24));
  } else {
    timescale = buf.readUInt32BE(mvhd.start + mvhd.headerSize + 12);
    duration = buf.readUInt32BE(mvhd.start + mvhd.headerSize + 16);
  }
  const durationSec = timescale > 0 ? duration / timescale : 0;

  let width = 0;
  let height = 0;
  let videoCodec: string | null = null;
  let audioCodec: string | null = null;

  for (const trak of children(buf, moov).filter((b) => b.type === "trak")) {
    const mdia = findChild(buf, trak, "mdia");
    if (!mdia) continue;
    const hdlr = findChild(buf, mdia, "hdlr");
    const handler = hdlr ? buf.toString("latin1", hdlr.start + hdlr.headerSize + 8, hdlr.start + hdlr.headerSize + 12) : "";
    const minf = findChild(buf, mdia, "minf");
    const stbl = minf ? findChild(buf, minf, "stbl") : undefined;
    const stsd = stbl ? findChild(buf, stbl, "stsd") : undefined;
    const entries = stsd ? readBoxes(buf, stsd.start + stsd.headerSize + 8, stsd.start + stsd.size) : [];
    const codec = entries[0]?.type ?? null;

    if (handler === "vide" || (codec && VISUAL_CODECS.has(codec))) {
      if (codec && !videoCodec) videoCodec = codec;
      if (entries[0]) {
        // VisualSampleEntry: 6 reserved + 2 data_reference_index + 16 pre-defined/reserved, then width/height (uint16 each)
        const base = entries[0].start + entries[0].headerSize;
        const w = buf.readUInt16BE(base + 24);
        const h = buf.readUInt16BE(base + 26);
        if (w && h && !width) {
          width = w;
          height = h;
        }
      }
      if (!width) {
        const tkhd = findChild(buf, trak, "tkhd");
        if (tkhd) {
          const v = buf.readUInt8(tkhd.start + tkhd.headerSize);
          const off = tkhd.start + tkhd.headerSize + (v === 1 ? 96 : 84);
          width = buf.readUInt32BE(off) >>> 16;
          height = buf.readUInt32BE(off + 4) >>> 16;
        }
      }
    } else if (handler === "soun" || (codec && AUDIO_CODECS.has(codec))) {
      if (codec && !audioCodec) audioCodec = codec;
    }
  }

  return { durationSec, width, height, videoCodec, audioCodec, hasAudio: audioCodec !== null, brands };
}
