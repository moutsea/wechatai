import { describe, expect, it } from "vitest";
import { verifyGeneratedImage } from "../src/server/media";
import { pixelPng, pngChunk, pngWithoutPixels } from "./helpers/generated-png";

describe("PNG pixel validation", () => {
  it.each([
    { label: "RGB", data: pixelPng() },
    { label: "packed grayscale", data: pixelPng([0, 0x80], { depth: 1, color: 0 }) },
    { label: "palette", data: pixelPng([0, 0x80], { depth: 1, color: 3 }) },
    {
      label: "16-bit RGBA",
      data: pixelPng([0, 0, 255, 0, 255, 0, 255, 255, 255], { depth: 16, color: 6 }),
    },
    { label: "Adam7", data: pixelPng(new Uint8Array(33), { width: 3, height: 3, interlace: 1 }) },
    {
      label: "multiple inflate steps",
      data: pixelPng(
        Uint8Array.from({ length: 301 }, (_, index) => (index ? index % 256 : 0)),
        { width: 100 },
      ),
    },
  ])("accepts real $label pixels", ({ data }) => {
    expect(verifyGeneratedImage(data).mime).toBe("image/png");
  });

  it.each([
    { label: "no IDAT", data: pngWithoutPixels },
    { label: "too few pixels", data: pixelPng([0, 1]) },
    { label: "too many pixels", data: pixelPng([0, 1, 2, 3, 4]) },
    { label: "invalid row filter", data: pixelPng([5, 1, 2, 3]) },
    { label: "missing rows", data: pixelPng([0, 1, 2, 3], { height: 2 }) },
    {
      label: "incomplete Adam7 passes",
      data: pixelPng(new Uint8Array(32), { width: 3, height: 3, interlace: 1 }),
    },
  ])("rejects a complete-looking PNG with $label", ({ data }) => {
    expect(() => verifyGeneratedImage(data)).toThrow(
      expect.objectContaining({ code: "image_invalid" }),
    );
  });

  it("rejects truncated or damaged zlib data even when the PNG ends with IEND", () => {
    const valid = pixelPng();
    const compressed = valid.subarray(41, -16);
    for (let length = 0; length < compressed.length; length++) {
      const truncated = Buffer.concat([
        valid.subarray(0, 33),
        pngChunk("IDAT", compressed.subarray(0, length)),
        pngChunk("IEND"),
      ]);
      expect(() => verifyGeneratedImage(truncated), `truncated at ${length}`).toThrow();
    }
    const damaged = Buffer.from(compressed);
    damaged[damaged.length - 1] ^= 1;
    const badChecksum = Buffer.concat([
      valid.subarray(0, 33),
      pngChunk("IDAT", damaged),
      pngChunk("IEND"),
    ]);
    expect(() => verifyGeneratedImage(badChecksum)).toThrow();
  });
});
