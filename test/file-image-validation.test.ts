import { describe, expect, it } from "vitest";
import { gifDimensions, svgDocument } from "../src/server/file-image-validation";
import { gif, patternedGif } from "./helpers/generated-gif";

describe("generated file image validation", () => {
  it.each([
    '<!doctype html><html><body><svg width="100" height="100"/></body></html>',
    'Example SVG code follows:\n<svg width="100" height="100"/>',
    '<document><svg width="100" height="100"/></document>',
    '<svg xmlns="urn:other-document"/>',
  ])("keeps embedded SVG examples as ordinary documents: %s", (text) => {
    expect(svgDocument(Buffer.from(text))).toBeNull();
  });

  it.each([
    "<svg/>",
    '\uFEFF<?xml version="1.0"?><!--diagram--><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10"/></svg>',
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg/>',
    '<s:svg xmlns:s="http://www.w3.org/2000/svg"><s:path/></s:svg>',
  ])("accepts complete SVG documents: %s", (text) => {
    expect(svgDocument(Buffer.from(text))).not.toBeNull();
  });

  it("recognizes a UTF-16 SVG independently of its filename", () => {
    expect(svgDocument(Buffer.from("\uFEFF<svg><path/></svg>", "utf16le"))).toContain("<svg>");
  });

  it.each([
    '<svg width="100" height="100"><path',
    '<svg width="100" height="100"',
    "<svg><path></svg>",
    "<svg/><!--unfinished",
    "<svg/>trailing text",
    "<svg/><svg/>",
    "<svg>&undefined;</svg>",
  ])("rejects incomplete or invalid SVGs: %s", (text) => {
    expect(() => svgDocument(Buffer.from(text))).toThrow();
  });

  it("validates real GIF pixels and animated frames", () => {
    expect(gifDimensions(gif)).toEqual({ width: 1, height: 1 });
    expect(gifDimensions(patternedGif)).toEqual({ width: 32, height: 32 });
    const animated = Buffer.concat([gif.subarray(0, -1), gif.subarray(19)]);
    expect(gifDimensions(animated)).toEqual({ width: 1, height: 1 });
  });

  it("rejects truncation at every point in a GIF, including a missing trailer", () => {
    for (let end = 0; end < gif.length; end++)
      expect(() => gifDimensions(gif.subarray(0, end)), `truncation at ${end}`).toThrow();
  });

  it.each([
    {
      label: "header without any frame",
      data: Buffer.concat([gif.subarray(0, 19), Buffer.from([0x3b])]),
    },
    { label: "undefined LZW code", index: 31, value: 0x7c },
    { label: "incomplete pixel count", index: 31, value: 0x2c },
    { label: "missing end code", index: 32, value: 0 },
    { label: "truncated subblock", index: 30, value: 10 },
    { label: "frame outside the canvas", index: 20, value: 1 },
    { label: "invalid code size", index: 29, value: 9 },
  ])("rejects a GIF with $label", (fixture) => {
    const data = Buffer.from(fixture.data ?? gif);
    if (fixture.index !== undefined) data[fixture.index] = fixture.value!;
    expect(() => gifDimensions(data)).toThrow();
  });
});
