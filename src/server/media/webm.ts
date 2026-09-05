/** Minimal EBML/WebM inspector for the Segment Info duration fields. */

interface ElementHeader {
  id: number;
  dataStart: number;
  dataEnd: number;
}

function vintLength(first: number): number {
  for (let length = 1; length <= 8; length++) {
    if (first & (0x80 >> (length - 1))) return length;
  }
  return 0;
}

function readVint(buf: Buffer, offset: number, keepMarker: boolean): { value: bigint; length: number; unknown: boolean } | null {
  if (offset >= buf.length) return null;
  const length = vintLength(buf[offset]);
  if (!length || offset + length > buf.length) return null;
  const marker = 0x80 >> (length - 1);
  let value = BigInt(keepMarker ? buf[offset] : buf[offset] & (marker - 1));
  for (let i = 1; i < length; i++) value = (value << 8n) | BigInt(buf[offset + i]);
  const unknown = !keepMarker && value === (1n << BigInt(length * 7)) - 1n;
  return { value, length, unknown };
}

function readElement(buf: Buffer, offset: number, limit: number): ElementHeader | null {
  const id = readVint(buf, offset, true);
  if (!id || id.value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const size = readVint(buf, offset + id.length, false);
  if (!size) return null;
  const dataStart = offset + id.length + size.length;
  if (dataStart > limit) return null;
  const available = limit - dataStart;
  const declared = size.unknown || size.value > BigInt(available) ? available : Number(size.value);
  return { id: Number(id.value), dataStart, dataEnd: dataStart + declared };
}

function children(buf: Buffer, start: number, end: number): ElementHeader[] {
  const out: ElementHeader[] = [];
  let offset = start;
  while (offset < end) {
    const element = readElement(buf, offset, end);
    if (!element || element.dataEnd <= offset) break;
    out.push(element);
    offset = element.dataEnd;
  }
  return out;
}

function unsigned(buf: Buffer, start: number, end: number): bigint | null {
  const length = end - start;
  if (length < 1 || length > 8) return null;
  let value = 0n;
  for (let i = start; i < end; i++) value = (value << 8n) | BigInt(buf[i]);
  return value;
}

function float(buf: Buffer, start: number, end: number): number | null {
  const length = end - start;
  if (length === 4) return buf.readFloatBE(start);
  if (length === 8) return buf.readDoubleBE(start);
  return null;
}

/** Return a finite positive WebM duration in seconds, or null when Info is absent/incomplete. */
export function inspectWebmDuration(buf: Buffer): number | null {
  const SEGMENT = 0x18538067;
  const INFO = 0x1549a966;
  const TIMECODE_SCALE = 0x2ad7b1;
  const DURATION = 0x4489;

  const segment = children(buf, 0, buf.length).find((element) => element.id === SEGMENT);
  if (!segment) return null;
  const info = children(buf, segment.dataStart, segment.dataEnd).find((element) => element.id === INFO);
  if (!info) return null;

  const fields = children(buf, info.dataStart, info.dataEnd);
  const scaleField = fields.find((element) => element.id === TIMECODE_SCALE);
  const durationField = fields.find((element) => element.id === DURATION);
  if (!durationField) return null;

  const scale = scaleField ? unsigned(buf, scaleField.dataStart, scaleField.dataEnd) : 1_000_000n;
  const duration = float(buf, durationField.dataStart, durationField.dataEnd);
  if (scale === null || duration === null) return null;
  const seconds = duration * (Number(scale) / 1_000_000_000);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
