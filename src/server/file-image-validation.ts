import { SaxesParser } from "saxes";

/** Only a complete SVG document is an image; SVG examples inside text/HTML are not. */
export function svgDocument(data: Uint8Array): string | null {
  const encoding =
    data[0] === 0xff && data[1] === 0xfe
      ? "utf-16le"
      : data[0] === 0xfe && data[1] === 0xff
        ? "utf-16be"
        : "utf-8";
  const text = new TextDecoder(encoding).decode(data);
  let rootSeen = false;
  let rootOpened = false;
  let svg = false;
  const otherDocument = new Error("Not an SVG document");
  const parser = new SaxesParser({ xmlns: true });
  parser.on("opentagstart", (tag) => {
    if (rootSeen) return;
    rootSeen = true;
    svg = tag.name.split(":").at(-1) === "svg";
    if (!svg) throw otherDocument;
  });
  parser.on("opentag", (tag) => {
    if (rootOpened) return;
    rootOpened = true;
    if (tag.uri && tag.uri !== "http://www.w3.org/2000/svg") throw otherDocument;
  });
  try {
    parser.write(text).close();
  } catch (error) {
    if (error === otherDocument || !svg) return null;
    throw new Error("Incomplete or invalid SVG document");
  }
  return svg ? text : null;
}

/** Check the GIF bitstream without allocating decoded pixels. Reading dimensions
 * alone accepts truncated headers and corrupt compressed image data. */
export function gifDimensions(data: Uint8Array) {
  const invalid = () => {
    throw new Error("Incomplete or invalid GIF");
  };
  const word = (offset: number) => data[offset] | (data[offset + 1] << 8);
  const width = word(6),
    height = word(8);
  if (
    !/^GIF8[79]a$/.test(Buffer.from(data.subarray(0, 6)).toString("ascii")) ||
    data.length < 13 ||
    !width ||
    !height ||
    width * height > 25_000_000
  )
    invalid();
  let offset = 13;
  const globalColors = data[10] & 0x80 ? 1 << ((data[10] & 7) + 1) : 0;
  offset += globalColors * 3;
  const blocks = () => {
    const chunks: Uint8Array[] = [];
    while (offset < data.length) {
      const size = data[offset++];
      if (!size) return Buffer.concat(chunks);
      if (offset + size > data.length) invalid();
      chunks.push(data.subarray(offset, offset + size));
      offset += size;
    }
    return invalid();
  };
  let frames = 0;
  while (offset < data.length) {
    const marker = data[offset++];
    if (marker === 0x3b) {
      if (!frames || offset !== data.length) invalid();
      return { width, height };
    }
    if (marker === 0x21) {
      if (offset >= data.length) invalid();
      const extension = data[offset++];
      const headerSize = { 0xf9: 4, 0x01: 12, 0xff: 11 }[extension];
      if (headerSize !== undefined && data[offset] !== headerSize) invalid();
      blocks();
      continue;
    }
    if (marker !== 0x2c || offset + 9 > data.length) invalid();
    const left = word(offset),
      top = word(offset + 2),
      frameWidth = word(offset + 4),
      frameHeight = word(offset + 6),
      flags = data[offset + 8];
    if (!frameWidth || !frameHeight || left + frameWidth > width || top + frameHeight > height)
      invalid();
    offset += 9;
    const localColors = flags & 0x80 ? 1 << ((flags & 7) + 1) : 0;
    offset += localColors * 3;
    const colors = localColors || globalColors;
    if (!colors || offset >= data.length) invalid();
    const minimum = data[offset++];
    if (minimum < 2 || minimum > 8) invalid();
    const compressed = blocks();
    verifyGifPixels(compressed, minimum, colors, frameWidth * frameHeight);
    frames++;
  }
  return invalid();
}

function verifyGifPixels(data: Uint8Array, minimum: number, colors: number, expected: number) {
  const clear = 1 << minimum,
    end = clear + 1;
  const lengths = new Uint32Array(4096);
  lengths.fill(1, 0, clear);
  let size = minimum + 1,
    next = end + 1,
    previous = -1,
    bit = 0,
    pixels = 0;
  while (bit + size <= data.length * 8) {
    const byte = bit >> 3;
    const code =
      ((data[byte] | (data[byte + 1] << 8) | (data[byte + 2] << 16)) >>> (bit & 7)) &
      ((1 << size) - 1);
    bit += size;
    if (code === clear) {
      size = minimum + 1;
      next = end + 1;
      previous = -1;
      continue;
    }
    if (code === end && pixels === expected) return;
    const length =
      code < next && code !== end
        ? lengths[code]
        : code === next && previous >= 0 && next < 4096
          ? lengths[previous] + 1
          : 0;
    if (!length || (code < clear && code >= colors) || pixels + length > expected) break;
    pixels += length;
    if (previous >= 0 && next < 4096) {
      lengths[next++] = lengths[previous] + 1;
      if (next === 1 << size && size < 12) size++;
    }
    previous = code;
  }
  throw new Error("Invalid GIF compressed pixels");
}
