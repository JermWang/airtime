import { describe, expect, it } from "vitest";
import { parseFormDataLimited } from "@/server/http";

describe("bounded multipart parsing", () => {
  it("parses a normal multipart request", async () => {
    const form = new FormData();
    form.set("placementId", "AD");
    form.set("file", new File([Buffer.from("creative")], "creative.txt"));
    const parsed = await parseFormDataLimited(new Request("http://airtime.test/upload", { method: "POST", body: form }), 4096);
    expect(parsed.get("placementId")).toBe("AD");
    expect((parsed.get("file") as File).size).toBe(8);
  });

  it("stops a streamed body that exceeds the real byte limit", async () => {
    // A body produced here, in chunks, with no Content-Length: the shape of a
    // chunked upload, where the only thing between the limit and the disk is
    // the byte counter in the reader loop.
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(512));
      },
    });
    const request = new Request("http://airtime.test/upload", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      body,
      // @ts-expect-error -- undici requires this for a streamed body; it is not in the DOM types
      duplex: "half",
    });
    await expect(parseFormDataLimited(request, 128)).rejects.toMatchObject({ status: 413 });
  });

  it("rejects an oversized declared length before reading", async () => {
    const request = new Request("http://airtime.test/upload", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x", "content-length": "5000" },
      body: Buffer.from("--x--"),
    });
    await expect(parseFormDataLimited(request, 100)).rejects.toMatchObject({ status: 413 });
  });
});
