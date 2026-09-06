import { describe, expect, it } from "vitest";
import { parseByteRange } from "@/app/media/[...key]/route";

describe("media byte ranges", () => {
  it("parses bounded and open-ended ranges", () => {
    expect(parseByteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=90-200", 100)).toEqual({ start: 90, end: 99 });
  });

  it("parses suffix ranges from the end", () => {
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=-200", 100)).toEqual({ start: 0, end: 99 });
  });

  it("rejects malformed, multiple, and unsatisfiable ranges", () => {
    expect(parseByteRange("bytes=100-", 100)).toBeNull();
    expect(parseByteRange("bytes=20-10", 100)).toBeNull();
    expect(parseByteRange("bytes=0-1,4-5", 100)).toBeNull();
    expect(parseByteRange("bytes=-0", 100)).toBeNull();
  });
});
