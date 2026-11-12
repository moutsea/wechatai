import { Unzlib } from "fflate";

/** Validate the actual PNG scanlines without allocating the full decoded image. */
export function verifyPngPixels(data: Uint8Array, width: number, height: number) {
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const invalid = () => {
    throw new Error("Incomplete or invalid PNG pixels");
  };
  if (
    bytes.length < 45 ||
    bytes.toString("ascii", 12, 16) !== "IHDR" ||
    bytes.readUInt32BE(8) !== 13
  )
    invalid();
  const depth = bytes[24],
    color = bytes[25],
    interlace = bytes[28];
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  const allowedDepths = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  }[color];
  if (!channels || !allowedDepths?.includes(depth) || bytes[26] || bytes[27] || interlace > 1)
    invalid();
  const chunks: Uint8Array[] = [];
  let palette = false,
    dataEnded = false,
    complete = false;
  for (let offset = 33; offset < bytes.length;) {
    if (offset + 12 > bytes.length) invalid();
    const length = bytes.readUInt32BE(offset),
      type = bytes.toString("ascii", offset + 4, offset + 8),
      next = offset + length + 12;
    if (next > bytes.length) invalid();
    if (type === "IDAT") {
      if (dataEnded || (color === 3 && !palette)) invalid();
      chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    } else {
      if (chunks.length) dataEnded = true;
      if (type === "PLTE") {
        if (palette || chunks.length || !length || length % 3 || length > 768) invalid();
        palette = true;
      } else if (type === "IEND") {
        if (length || next !== bytes.length) invalid();
        complete = true;
      } else if (/^[A-Z]/.test(type)) invalid();
    }
    offset = next;
  }
  const compressed = Buffer.concat(chunks);
  if (!complete || compressed.length < 6 || compressed[1] & 32) invalid();

  // Adam7 stores seven reduced images; each has its own rows and filter bytes.
  const passes = (
    interlace
      ? [
          [0, 0, 8, 8],
          [4, 0, 8, 8],
          [0, 4, 4, 8],
          [2, 0, 4, 4],
          [0, 2, 2, 4],
          [1, 0, 2, 2],
          [0, 1, 1, 2],
        ]
      : [[0, 0, 1, 1]]
  ).flatMap(([x, y, dx, dy]) => {
    const columns = Math.max(0, Math.ceil((width - x) / dx)),
      rows = Math.max(0, Math.ceil((height - y) / dy));
    return columns && rows ? [{ rows, bytes: Math.ceil((columns * channels! * depth) / 8) }] : [];
  });
  let pass = 0,
    row = 0,
    remaining = 0,
    adlerA = 1,
    adlerB = 0;
  const inflate = new Unzlib((chunk) => {
    for (const value of chunk) {
      adlerA += value;
      adlerB += adlerA;
      if (remaining) remaining--;
      else {
        if (pass >= passes.length || value > 4) invalid();
        remaining = passes[pass].bytes;
        if (++row === passes[pass].rows) {
          pass++;
          row = 0;
        }
      }
    }
    adlerA %= 65521;
    adlerB %= 65521;
  });
  // Limit each inflate step, including highly compressible 16-bit images.
  for (let offset = 0; offset < compressed.length; offset += 256)
    inflate.push(compressed.subarray(offset, offset + 256), offset + 256 >= compressed.length);
  if (
    pass !== passes.length ||
    remaining ||
    ((adlerB << 16) | adlerA) >>> 0 !== compressed.readUInt32BE(compressed.length - 4)
  )
    invalid();
}
