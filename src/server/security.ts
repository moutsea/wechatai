import { isIP } from "node:net";
import { AppError, secret } from "./config";
const enc = new TextEncoder();
export async function encrypt(env: Env, text: string, context: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", enc.encode(secret(env, "ENCRYPTION_KEY"))),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(context) },
    key,
    enc.encode(text),
  );
  return `${Buffer.from(iv).toString("base64")}.${Buffer.from(ciphertext).toString("base64")}`;
}
export async function decrypt(env: Env, value: string, context: string) {
  const [iv, body] = value.split(".");
  const key = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", enc.encode(secret(env, "ENCRYPTION_KEY"))),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Buffer.from(iv, "base64"), additionalData: enc.encode(context) },
      key,
      Buffer.from(body, "base64"),
    ),
  );
}
export function validateBaseUrl(value: string, allowedHosts = "") {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("invalid_url", "请输入有效的 HTTPS API 地址");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.port && url.port !== "443") ||
    !host.includes(".") ||
    isIP(host.replace(/^\[|\]$/g, "")) ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)
  )
    throw new AppError(
      "unsafe_url",
      "API 地址必须是公网 HTTPS 域名，不能使用 IP、内网地址或非标准端口",
    );
  const hosts = allowedHosts
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  if (hosts.length && !hosts.includes(host))
    throw new AppError("host_not_allowed", "该模型服务域名尚未被平台允许");
  return url.toString().replace(/\/+$/, "");
}
// Local integration testing is limited to one server-configured loopback service.
// This exception can never be enabled by an API client or on the production app.
function localKimiseek(env: Env, value: string) {
  try {
    const local = ["localhost", "127.0.0.1", "[::1]"];
    const configured = new URL(secret(env, "KIMISEEK_API_URL", false));
    const target = new URL(value);
    return (
      local.includes(new URL(env.APP_URL).hostname) &&
      local.includes(configured.hostname) &&
      configured.protocol === "http:" &&
      target.origin === configured.origin &&
      !target.username &&
      !target.password &&
      !target.search &&
      !target.hash
    );
  } catch {
    return false;
  }
}
export function validateModelBaseUrl(env: Env, value: string) {
  if (
    localKimiseek(env, value) &&
    value.replace(/\/+$/, "") === secret(env, "KIMISEEK_API_URL", false).replace(/\/+$/, "")
  )
    return value.replace(/\/+$/, "");
  return validateBaseUrl(value, env.LLM_ALLOWED_HOSTS);
}
export async function validateModelDNS(env: Env, value: string) {
  if (!localKimiseek(env, value)) await validatePublicDNS(value);
}
export function publicIPv4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    isIP(ip) === 4 &&
    !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    )
  );
}
export async function validatePublicDNS(baseUrl: string) {
  const host = new URL(baseUrl).hostname;
  const results = await Promise.all(
    ["A", "AAAA"].map(async (type) => {
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
        {
          headers: { accept: "application/dns-json" },
          signal: AbortSignal.timeout(8000),
          redirect: "manual",
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new AppError("dns_unavailable", "暂时无法验证模型服务地址，请稍后重试", 502);
      }
      return (await readJson(response)) as { Answer?: { type: number; data: string }[] };
    }),
  );
  const records = results
    .flatMap((r) => r.Answer ?? [])
    .filter((a) => a.type === 1 || a.type === 28);
  // IPv6 must be global unicast; deny documentation and transition mechanisms.
  const publicIPv6 = (ip: string) =>
    isIP(ip) === 6 && /^[23][\da-f]{3}:/i.test(ip) && !/^2001:(?:db8|0|10|20):|^2002:/i.test(ip);
  if (
    !records.length ||
    records.some((a) => (a.type === 1 ? !publicIPv4(a.data) : !publicIPv6(a.data)))
  )
    throw new AppError("unsafe_dns", "模型服务未解析到可访问的公网地址");
}
export async function readJson(response: Response, maxBytes = 2_000_000): Promise<unknown> {
  if (!response.body) throw new AppError("upstream_empty", "服务返回了空响应", 502);
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new AppError("upstream_too_large", "服务响应过大", 502);
      chunks.push(value);
    }
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(joined));
  } catch {
    throw new AppError("upstream_format", "服务未返回有效 JSON", 502);
  }
}
