#!/usr/bin/env node
// 手动向 IndexNow 提交 wechatai.app 的公开 URL。
// 用法：node scripts/indexnow-submit.mjs [--url <url> | --file <路径>] [--dry-run]
// 默认读取 https://wechatai.app/sitemap.xml；key 始终取自 public/<key>.txt 证明文件。
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE_ORIGIN = "https://wechatai.app";
const SITE_HOST = new URL(SITE_ORIGIN).hostname;
const SITEMAP_URL = `${SITE_ORIGIN}/sitemap.xml`;
const ENDPOINT = "https://api.indexnow.org/IndexNow";
const MAX_BATCH = 10_000;
const KEY_FILE = /^([0-9a-f]{32})\.txt$/;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const USAGE =
  "用法：node scripts/indexnow-submit.mjs [--url <url> | --file <路径>] [--dry-run]";

export function parseArgs(argv) {
  const options = { url: null, file: null, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--url" || arg === "--file") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} 需要一个值`);
      i += 1;
      const field = arg === "--url" ? "url" : "file";
      if (options[field]) throw new Error(`${arg} 只能使用一次`);
      options[field] = value;
    } else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`未知参数\n${USAGE}`);
  }
  if (options.url && options.file) throw new Error("--url 与 --file 互斥");
  return options;
}

/** key 与线上证明文件同源：目录里唯一的 32 位小写十六进制 .txt 文件。 */
export async function readProofKey(root = REPO_ROOT) {
  const publicDir = resolve(root, "public");
  const names = (await readdir(publicDir)).filter((name) => KEY_FILE.test(name));
  if (names.length !== 1)
    throw new Error(
      `public/ 中应有且只有一个 IndexNow 证明文件（32 位小写十六进制 .txt），实际 ${names.length} 个`,
    );
  const name = names[0];
  const key = name.slice(0, -4);
  const content = await readFile(resolve(publicDir, name), "utf8");
  if (content !== key)
    throw new Error("IndexNow 证明文件内容与文件名不一致：应只包含 key，且没有多余空白或换行");
  return key;
}

export function normalizeSiteUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("无效 URL");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== SITE_HOST ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error(`只提交 ${SITE_ORIGIN} 不含凭据或非默认端口的 HTTPS URL`);
  url.hash = "";
  return url.href;
}

const XML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function parseSitemap(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].map((match) =>
    match[1].replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => XML_ENTITIES[name]),
  );
}

async function fetchSitemapUrls(fetchImpl) {
  const response = await fetchImpl(SITEMAP_URL, { headers: { accept: "application/xml" } });
  if (!response.ok) throw new Error(`读取 sitemap 失败：HTTP ${response.status}`);
  return parseSitemap(await response.text());
}

async function readUrlFile(path) {
  const text = (await readFile(path, "utf8")).replace(/^\uFEFF/, "");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 响应可能回显 key；统一脱敏并截断，避免把验证串写进日志。 */
export function redactBody(body, key) {
  const text = body.trim().replaceAll(key, "[redacted-key]");
  return text.length > 1000 ? `${text.slice(0, 1000)}…` : text;
}

export async function run(argv, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const log = deps.log ?? ((line) => console.log(line));
  const options = parseArgs(argv);
  if (options.help) {
    log(USAGE);
    return { help: true, urls: [], results: [] };
  }

  const key = await readProofKey(deps.root ?? REPO_ROOT);
  const source = options.url
    ? [options.url]
    : options.file
      ? await readUrlFile(options.file)
      : await fetchSitemapUrls(fetchImpl);
  const urls = source.map((value) => normalizeSiteUrl(value));
  if (!urls.length) throw new Error("没有可提交的 URL");

  if (options.dryRun) {
    for (const url of urls) log(url);
    log(`Dry run：${urls.length} 个 URL，未发送任何 POST 请求。`);
    return { dryRun: true, urls, results: [] };
  }

  const keyLocation = `${SITE_ORIGIN}/${key}.txt`;
  const batches = [];
  for (let i = 0; i < urls.length; i += MAX_BATCH) batches.push(urls.slice(i, i + MAX_BATCH));

  const results = [];
  let failed = false;
  for (const [index, urlList] of batches.entries()) {
    const label = `批次 ${index + 1}/${batches.length}（${urlList.length} 个 URL）`;
    let response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host: SITE_HOST, key, keyLocation, urlList }),
      });
    } catch (error) {
      failed = true;
      results.push({ status: null, urlCount: urlList.length });
      log(`${label}：网络错误 ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    results.push({ status: response.status, urlCount: urlList.length });
    log(`${label}：HTTP ${response.status}`);
    if (!response.ok) {
      failed = true;
      const body = redactBody(await response.text(), key);
      if (body) log(body);
    }
  }
  if (failed) throw new Error("IndexNow 提交失败：至少一个批次未成功");
  return { dryRun: false, keyLocation, urls, results };
}

export async function main(argv) {
  try {
    await run(argv);
    return 0;
  } catch (error) {
    console.error(`IndexNow：${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
