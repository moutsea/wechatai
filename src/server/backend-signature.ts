import contract from "../../backend/contract/contract.json";

const encoder = new TextEncoder();

export function backendOrigin(value: string) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Backend configuration requires an HTTPS origin");
  return url.origin;
}

export type SigningOptions = { now?: number; requestId?: string; signal?: AbortSignal };

async function signedHeaders(
  url: URL,
  secret: string,
  hash: string,
  method: "GET" | "POST",
  options: SigningOptions,
) {
  if (encoder.encode(secret).byteLength < 32)
    throw new Error("Backend RPC secret must contain at least 32 bytes");
  const now = options.now ?? Date.now();
  const requestId = options.requestId ?? crypto.randomUUID();
  if (!Number.isSafeInteger(now) || now <= 0 || !/^[A-Za-z0-9._:-]{8,128}$/.test(requestId))
    throw new Error("Invalid backend signing parameters");
  const message = [contract.protocol, method, url.pathname, String(now), requestId, hash].join(
    "\n",
  );
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  const encoded = btoa(String.fromCharCode(...signature))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return {
    "X-Wechatai-Body-SHA256": hash,
    "X-Wechatai-Time": String(now),
    "X-Wechatai-Request-Id": requestId,
    "X-Wechatai-Signature": encoded,
  };
}

export async function signedRequest(
  url: URL,
  secret: string,
  hash: string,
  body: BodyInit,
  options: SigningOptions,
) {
  return new Request(url, {
    method: "POST",
    redirect: "manual",
    signal: options.signal,
    headers: {
      "Content-Type": "application/json",
      ...(await signedHeaders(url, secret, hash, "POST", options)),
    },
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" as const } : {}),
  });
}

export async function signedUpgrade(url: URL, secret: string) {
  const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  return new Request(url, {
    redirect: "manual",
    headers: {
      Upgrade: "websocket",
      ...(await signedHeaders(url, secret, emptyHash, "GET", {})),
    },
  });
}
