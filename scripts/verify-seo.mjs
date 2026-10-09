import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

// Verify the actual deployable output; metadata-only tests cannot catch an empty SPA shell.
const dir = new URL("../dist/client/", import.meta.url);
const read = (name) => readFile(new URL(name, dir), "utf8");
for (const [file, canonical, text] of [
  ["index.html", "https://wechatai.app/", "与自选大模型对话。"],
  ["guide.html", "https://wechatai.app/guide", "微信命令速查"],
  ["developers/hermes.html", "https://wechatai.app/developers/hermes", "Hermes 接入指南"],
  ["developers/openclaw.html", "https://wechatai.app/developers/openclaw", "OpenClaw 接入指南"],
  ["developers/plugins.html", "https://wechatai.app/developers/plugins", "最小适配示例"],
]) {
  const html = await read(file);
  assert.equal((html.match(/<title\b/g) || []).length, 1, `${file}: one title`);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${file}: one primary heading`);
  assert(html.includes(`rel="canonical" href="${canonical}"`), `${file}: canonical`);
  assert(html.includes('content="index, follow, max-image-preview:large"'), `${file}: indexable`);
  assert(html.includes(text), `${file}: body exists before JavaScript`);
  assert(html.includes('href="/register"'), `${file}: usable registration link`);
  assert(!html.includes('id="root"></div>'), `${file}: not an empty SPA shell`);
  assert(!html.includes("admin@wechatai.com"), `${file}: no account data`);
  const json = html.match(/<script type="application\/ld\+json" data-seo>(.*?)<\/script>/)?.[1];
  assert.equal(JSON.parse(json)["@context"], "https://schema.org");
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)];
  assert(assets.length >= 2, `${file}: client script and stylesheet`);
  for (const match of assets) await access(new URL(match[1].slice(1), dir));
}
for (const file of [
  "login.html",
  "register.html",
  "app.html",
  "app/sessions.html",
  "app/plugins.html",
  "demo/plugins.html",
  "app/credits.html",
  "demo.html",
  "demo/channels.html",
  "demo/credits.html",
  "404.html",
]) {
  const html = await read(file);
  assert(html.includes('content="noindex, follow"'), `${file}: noindex`);
  assert(!html.includes('rel="canonical"'), `${file}: no public canonical`);
}
assert((await read("404.html")).includes("这个页面没有找到。"));
assert((await read("robots.txt")).includes("Sitemap: https://wechatai.app/sitemap.xml"));
assert.equal(((await read("sitemap.xml")).match(/<loc>/g) || []).length, 5);
const image = await readFile(new URL("og-image.png", dir));
assert.equal(image.subarray(1, 4).toString(), "PNG");
assert.equal(image.readUInt32BE(16), 1200);
assert.equal(image.readUInt32BE(20), 630);

// Optional deployment/preview smoke check: node scripts/verify-seo.mjs http://127.0.0.1:5174
if (process.argv[2]) {
  const origin = new URL(process.argv[2]);
  for (const path of [
    "/",
    "/guide",
    "/developers/plugins",
    "/login",
    "/register",
    "/app",
    "/app/channels",
    "/app/assistants",
    "/app/wechat",
    "/app/sessions",
    "/app/plugins",
    "/demo/plugins",
    "/app/billing",
    "/app/credits",
    "/demo",
    "/demo/sessions",
    "/demo/credits",
  ]) {
    const response = await fetch(new URL(path, origin), { redirect: "manual" });
    assert.equal(response.status, 200, `${path}: status`);
    const html = await response.text();
    assert(html.includes('<html lang="zh-CN">'), `${path}: HTML`);
    if (!["/", "/guide", "/developers/plugins"].includes(path)) {
      assert.match(response.headers.get("x-robots-tag") || "", /noindex/, `${path}: header`);
      assert(html.includes('content="noindex, follow"'), `${path}: noindex HTML`);
    }
  }
  for (const path of ["/guide/", "/guide.html", "/index.html"]) {
    const response = await fetch(new URL(path, origin), { redirect: "manual" });
    assert.equal(response.status, 307, `${path}: canonical redirect`);
  }
  for (const path of ["/not-a-real-page", "/nested/not-a-real-page"]) {
    const response = await fetch(new URL(path, origin));
    assert.equal(response.status, 404, `${path}: real 404`);
    assert((await response.text()).includes("这个页面没有找到。"));
  }
  for (const path of ["/sitemap.xml", "/robots.txt", "/og-image.png", "/favicon.svg"]) {
    const response = await fetch(new URL(path, origin));
    assert.equal(response.status, 200, `${path}: asset`);
  }
}
console.log("SEO checks passed: rendered pages, metadata, indexing boundaries and social image.");
