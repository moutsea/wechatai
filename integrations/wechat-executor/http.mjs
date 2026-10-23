import { request } from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createGunzip, createInflate, createBrotliDecompress } from "node:zlib";

export function publicAddress(ip) {
  if (isIP(ip) === 6) {
    const [first, second] = ip.split(":").map((v) => parseInt(v || "0", 16));
    return (
      first >= 0x2000 &&
      first < 0x4000 &&
      first !== 0x2002 &&
      first !== 0x3fff &&
      !(first === 0x2001 && (second < 0x200 || second === 0xdb8))
    );
  }
  if (isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && [0, 168].includes(b)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && [18, 19].includes(b)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export async function publicLookup(host, _options, callback) {
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((v) => !publicAddress(v.address)))
      throw new Error("unsafe_dns");
    const chosen = addresses.find((v) => v.family === 4) ?? addresses[0];
    // Bind the validated address to the socket; no second DNS lookup/rebinding.
    if (_options.all) callback(null, [chosen]);
    else callback(null, chosen.address, chosen.family);
  } catch (error) {
    callback(error);
  }
}
export function validateTarget(raw) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    !url.hostname.includes(".") ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)
  )
    throw new Error("unsafe_url");
  return url;
}
export async function executeHttp(input, outerSignal) {
  const url = validateTarget(input.url);
  if (!["GET", "POST"].includes(input.method)) throw new Error("invalid_method");
  const limit = Math.min(input.maxBytes, 12_000_000);
  if (!(limit > 0)) throw new Error("invalid_limit");
  const signal = AbortSignal.any([
    outerSignal,
    AbortSignal.timeout(Math.max(1, Math.min(300000, input.timeoutMs))),
  ]);
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: input.method,
        headers: { ...input.headers, "accept-encoding": "identity" },
        lookup: publicLookup,
        signal,
        agent: false,
      },
      async (response) => {
        const encoding = response.headers["content-encoding"];
        const decoder =
          encoding === "gzip"
            ? createGunzip()
            : encoding === "br"
              ? createBrotliDecompress()
              : encoding === "deflate"
                ? createInflate()
                : null;
        const source = decoder ? response.pipe(decoder) : response;
        response.on("error", (e) => source.destroy(e));
        const chunks = [];
        let bytes = 0;
        try {
          for await (const chunk of source) {
            bytes += chunk.length;
            if (bytes > limit) throw new Error("response_too_large");
            chunks.push(chunk);
          }
          const headers = {};
          for (const key of ["content-type", "location", "x-request-id", "request-id"]) {
            const value = response.headers[key];
            if (typeof value === "string") headers[key] = value;
          }
          resolve({
            status: response.statusCode,
            headers,
            body: Buffer.concat(chunks).toString("base64"),
          });
        } catch (error) {
          req.destroy();
          source.destroy();
          reject(error);
        }
      },
    );
    req.on("error", reject);
    req.end(input.body);
  });
}
