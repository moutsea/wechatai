import { zlibSync } from "fflate";

export function pngChunk(type: string, data = Buffer.alloc(0)) {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const value of body) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, checksum]);
}

export function pixelPng(
  pixels: number[] | Uint8Array = [0, 50, 60, 70],
  options: {
    width?: number;
    height?: number;
    depth?: number;
    color?: number;
    interlace?: number;
  } = {},
) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(options.width ?? 1, 0);
  header.writeUInt32BE(options.height ?? 1, 4);
  header[8] = options.depth ?? 8;
  header[9] = options.color ?? 2;
  header[12] = options.interlace ?? 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    ...(header[9] === 3 ? [pngChunk("PLTE", Buffer.from([0, 0, 0, 255, 255, 255]))] : []),
    pngChunk("IDAT", Buffer.from(zlibSync(Uint8Array.from(pixels)))),
    pngChunk("IEND"),
  ]);
}

export const pngWithoutPixels = Buffer.concat([pixelPng().subarray(0, 33), pngChunk("IEND")]);
