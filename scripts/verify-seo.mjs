import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

// Verify the actual deployable output; metadata-only tests cannot catch an empty SPA shell.
const dir = new URL("../dist/client/", import.meta.url);
const read = (name) => readFile(new URL(name, dir), "utf8");
const workerDocuments = [
  ["/developers/plugins.md", "text/markdown", "给 AI agent 的起点"],
  ["/developers/openclaw.md", "text/markdown", "# OpenClaw 接入指南"],
  ["/developers/hermes.md", "text/markdown", "# Hermes 接入指南"],
  ["/developers/notifications.md", "text/markdown", "# 消息提醒 HTTP 接入"],
  ["/llms.txt", "text/plain", "# Wechatai"],
];
// These are dynamic responses. An asset-first navigation otherwise returns the
// static 404 page even when a direct Worker unit test passes.
const builtConfig = JSON.parse(
  await readFile(new URL("../dist/wechatai/wrangler.json", import.meta.url), "utf8"),
);
for (const [path] of workerDocuments) {
  assert(builtConfig.assets.run_worker_first.includes(path), `${path}: Worker route in build`);
}
const publicPages = [
  ["index.html", "https://wechatai.app/", "把你的 AI"],
  ["docs.html", "https://wechatai.app/docs", "跟着教程配置"],
  ...[
    ["getting-started", "三步开始聊天"],
    ["channels-models", "设置提示词与输入输出上限"],
    ["wechat-connection", "管理多个链接"],
    ["commands", "命令一览"],
    ["sessions", "长对话怎么处理？"],
    ["attachments", "先发附件，再说要求"],
    ["credits", "邀请好友，获得永久 credits"],
    ["faq", "模型自称和我的配置不一样？"],
    ["ds-chat", "配置模型与搜索服务"],
    ["image-generation", "描述画面和比例"],
    ["roleplay", "导入角色卡与世界书"],
    ["personal-assistant", "定时提醒"],
    ["notifications", "发送第一条通知"],
  ].map(([slug, marker]) => [`docs/${slug}.html`, `https://wechatai.app/docs/${slug}`, marker]),
  [
    "docs/deepseek-in-wechat.html",
    "https://wechatai.app/docs/deepseek-in-wechat",
    "第一步：添加 DeepSeek 渠道和模型",
  ],
  [
    "docs/multiple-openclaw-in-wechat.html",
    "https://wechatai.app/docs/multiple-openclaw-in-wechat",
    "第二步：添加生活助手，保留原连接",
  ],
  [
    "docs/hermes-in-wechat.html",
    "https://wechatai.app/docs/hermes-in-wechat",
    "第二步：执行一键连接命令",
  ],
  ["developers/hermes.html", "https://wechatai.app/developers/hermes", "Hermes 接入指南"],
  ["developers/openclaw.html", "https://wechatai.app/developers/openclaw", "OpenClaw 接入指南"],
  ["developers/plugins.html", "https://wechatai.app/developers/plugins", "最小适配示例"],
  ["terms.html", "https://wechatai.app/terms", "服务协议正文"],
  ["privacy.html", "https://wechatai.app/privacy", "隐私政策正文"],
  ["contact.html", "https://wechatai.app/contact", "cfjwlchangji@gmail.com"],
];
// Query-driven landing pages. The marker is the rendered H1, which proves the
// page component ran during prerender instead of falling through to NotFound.
const landingPages = [
  ["wechat-ai.html", "https://wechatai.app/wechat-ai", "微信 AI：把你的大模型接进微信聊天"],
  ["wechat-clawbot.html", "https://wechatai.app/wechat-clawbot", "微信 ClawBot 插件：入口、绑定与不回复排查"],
  ["wechat-ai-ban-risk.html", "https://wechatai.app/wechat-ai-ban-risk", "微信用 AI 会被封号吗：三类接法的风险差异"],
  ["wechat-clawbot-models.html", "https://wechatai.app/wechat-clawbot-models", "微信 ClawBot 支持哪些模型？"],
  ["bring-your-own-api-key.html", "https://wechatai.app/bring-your-own-api-key", "用自己的 API Key，把 AI 接进微信"],
  ["wechat-deepseek.html", "https://wechatai.app/wechat-deepseek", "微信接入 DeepSeek：先选路，再配置"],
  ["wechat-claude.html", "https://wechatai.app/wechat-claude", "微信接入 Claude：绕开桥接的那条路"],
  ["wechat-gpt.html", "https://wechatai.app/wechat-gpt", "微信接入 GPT：跳过部署这一步"],
  ["wechat-agent.html", "https://wechatai.app/wechat-agent", "把 Agent 接进微信，而不只是模型"],
  ["wechat-ai-options.html", "https://wechatai.app/wechat-ai-options", "微信 AI 怎么选：四类方案的真实取舍"],
  ["pricing.html", "https://wechatai.app/pricing", "价格：我们不卖 token"],
];
publicPages.push(...landingPages);
const publicTitles = new Set();
const publicDescriptions = new Set();
for (const [file, canonical, text] of publicPages) {
  const html = await read(file);
  assert.equal((html.match(/<title\b/g) || []).length, 1, `${file}: one title`);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${file}: one primary heading`);
  const title = html.match(/<title[^>]*>(.*?)<\/title>/s)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  assert(title && !publicTitles.has(title), `${file}: unique search title`);
  assert(description && !publicDescriptions.has(description), `${file}: unique search description`);
  publicTitles.add(title);
  publicDescriptions.add(description);
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
  if (file.startsWith("docs/")) {
    if (
      /docs\/(deepseek-in-wechat|multiple-openclaw-in-wechat|hermes-in-wechat)\.html/.test(file)
    ) {
      assert(
        html.includes('class="docs-screenshot"'),
        `${file}: tutorial screenshots are rendered`,
      );
    }
    assert(html.includes('aria-label="文档导航"'), `${file}: shared document navigation`);
    assert(
      [...html.matchAll(/<a\b[^>]*>/g)].some(
        ([tag]) =>
          tag.includes(`href="${new URL(canonical).pathname}"`) &&
          tag.includes('aria-current="page"'),
      ),
      `${file}: active navigation item`,
    );
    assert(html.includes('property="og:type" content="article"'), `${file}: article metadata`);
    const graph = JSON.parse(json)["@graph"];
    assert.equal(graph.find((item) => item["@type"] === "Article").url, canonical);
    assert(graph.some((item) => item["@type"] === "BreadcrumbList"));
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(ids.length, new Set(ids).size, `${file}: unique section IDs`);
    for (const match of html.matchAll(/href="#([^"]+)"/g)) {
      assert(ids.includes(match[1]), `${file}: table of contents target ${match[1]}`);
    }
    for (const match of html.matchAll(/<a\b[^>]*href="(\/[^"#?]*)/g)) {
      const path = match[1];
      assert.notEqual(path, "/guide", `${file}: internal links use canonical docs URLs`);
      // The Markdown protocol is a Worker endpoint, not a static HTML file.
      if (path === "/" || path.startsWith("/app") || workerDocuments.some(([url]) => url === path))
        continue;
      await access(new URL(path.slice(1) + (path.startsWith("/images/") ? "" : ".html"), dir));
    }
    for (const match of html.matchAll(/href="(\/docs\/[^"#?]+)#([^"]+)"/g)) {
      const targetHtml = await read(`${match[1].slice(1)}.html`);
      assert(targetHtml.includes(`id="${match[2]}"`), `${file}: section link ${match[0]}`);
    }
    for (const match of html.matchAll(/src="(\/images\/[^"?#]+)"/g)) {
      await access(new URL(match[1].slice(1), dir));
    }
  }
}
// Landing pages must be citable: a direct answer block, a FAQ accordion backed by
// FAQPage structured data, a breadcrumb, and internal links that all resolve.
for (const [file, , marker] of landingPages) {
  const html = await read(file);
  assert(html.includes('class="seopage-answer"'), `${file}: direct answer block`);
  assert(html.includes('id="faq"'), `${file}: FAQ section`);
  assert(html.includes(`<h1>${marker}</h1>`), `${file}: landing heading from page data`);
  const graph = JSON.parse(
    html.match(/<script type="application\/ld\+json" data-seo>(.*?)<\/script>/)[1],
  )["@graph"];
  assert(graph.some((item) => item["@type"] === "BreadcrumbList"), `${file}: breadcrumb data`);
  assert(graph.some((item) => item["@type"] === "FAQPage"), `${file}: FAQ data`);
  const page = graph.find((item) => item["@type"] === "WebPage" || item["@type"] === "Article");
  assert(page && (page.description || "").length > 40, `${file}: page node description`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size, `${file}: unique section IDs`);
  for (const match of html.matchAll(/href="#([^"]+)"/g)) {
    assert(ids.includes(match[1]), `${file}: in-page anchor target ${match[1]}`);
  }
  assert(!html.includes('href="/guide"'), `${file}: no legacy internal links`);
  for (const match of html.matchAll(/<a\b[^>]*href="(\/[^"#?]*)/g)) {
    const path = match[1];
    if (path === "/" || path.startsWith("/app") || workerDocuments.some(([url]) => url === path))
      continue;
    await access(new URL(path.slice(1) + ".html", dir));
  }
  for (const match of html.matchAll(/href="(\/[^"#?]+)#([^"]+)"/g)) {
    const target = await read(`${match[1].slice(1)}.html`);
    assert(target.includes(`id="${match[2]}"`), `${file}: cross-page anchor ${match[0]}`);
  }
}
const legacy = await read("guide.html");
assert(
  !legacy.includes('content="noindex, follow"'),
  "legacy canonical does not conflict with noindex",
);
assert(legacy.includes('rel="canonical" href="https://wechatai.app/docs/getting-started"'));
assert(legacy.includes("三步开始聊天"), "legacy guide has a usable no-JS fallback");
assert(legacy.includes('href="/docs/commands"'), "legacy guide exposes command reference");
assert(!(await read("sitemap.xml")).includes("https://wechatai.app/guide"));
const redirectRules = await read("_redirects");
for (const path of ["/guide", "/guide/", "/guide.html"]) {
  assert(
    redirectRules.includes(`${path} /docs/getting-started 301`),
    `${path}: permanent guide redirect without overriding fragment`,
  );
}
for (const [, canonical] of publicPages) {
  const path = new URL(canonical).pathname;
  for (const alias of path === "/" ? ["/index.html"] : [`${path}/`, `${path}.html`])
    assert(
      redirectRules.includes(`${alias} ${path} 301`),
      `${alias}: permanent redirect to canonical URL`,
    );
}
const docsIndex = await read("docs.html");
for (const [file] of publicPages.filter(([file]) => file.startsWith("docs/"))) {
  assert(
    docsIndex.includes(`href="/${file.slice(0, -5)}"`),
    `${file}: discoverable from docs index`,
  );
}
assert(
  (await read("index.html")).match(/<nav class="landing-nav">[\s\S]*?href="\/docs"[\s\S]*?<\/nav>/),
  "homepage navigation includes docs",
);
for (const slug of ["deepseek-in-wechat", "multiple-openclaw-in-wechat", "hermes-in-wechat"])
  assert(
    (await read("index.html")).includes(`href="/docs/${slug}"`),
    "homepage links to tutorials",
  );
for (const file of [
  "login.html",
  "register.html",
  "verify-email.html",
  "forgot-password.html",
  "reset-password.html",
  "app.html",
  "app/sessions.html",
  "app/plugins.html",
  "demo/plugins.html",
  "app/notices.html",
  "demo/notices.html",
  "app/credits.html",
  "app/admin.html",
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
assert.equal(((await read("sitemap.xml")).match(/<loc>/g) || []).length, publicPages.length);
const image = await readFile(new URL("og-image.png", dir));
assert.equal(image.subarray(1, 4).toString(), "PNG");
assert.equal(image.readUInt32BE(16), 1200);
assert.equal(image.readUInt32BE(20), 630);

// Optional deployment/preview smoke check: node scripts/verify-seo.mjs http://127.0.0.1:5174
if (process.argv[2]) {
  const origin = new URL(process.argv[2]);
  for (const [path, contentType, marker] of workerDocuments) {
    for (const headers of [{}, { "sec-fetch-mode": "navigate" }]) {
      const response = await fetch(new URL(path, origin), { headers, redirect: "manual" });
      assert.equal(response.status, 200, `${path}: public document status`);
      assert(
        response.headers.get("content-type")?.startsWith(contentType),
        `${path}: document content type`,
      );
      assert((await response.text()).includes(marker), `${path}: document body`);
    }
  }
  for (const path of [
    ...publicPages.map(([, canonical]) => new URL(canonical).pathname),
    "/login",
    "/register",
    "/app",
    "/app/channels",
    "/app/assistants",
    "/app/wechat",
    "/app/sessions",
    "/app/plugins",
    "/demo/plugins",
    "/app/notices",
    "/demo/notices",
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
    if (!publicPages.some(([, canonical]) => new URL(canonical).pathname === path)) {
      assert.match(response.headers.get("x-robots-tag") || "", /noindex/, `${path}: header`);
      assert(html.includes('content="noindex, follow"'), `${path}: noindex HTML`);
    }
  }
  for (const [, canonical] of publicPages) {
    const path = new URL(canonical).pathname;
    for (const alias of path === "/" ? ["/index.html"] : [`${path}/`, `${path}.html`]) {
      const response = await fetch(new URL(alias, origin), { redirect: "manual" });
      assert.equal(response.status, 301, `${alias}: permanent canonical redirect`);
      assert.equal(
        new URL(response.headers.get("location"), origin).href,
        new URL(path, origin).href,
      );
      await response.body?.cancel();
    }
  }
  for (const path of ["/guide", "/guide/", "/guide.html", "/guide?utm_source=wechat"]) {
    const response = await fetch(new URL(path, origin), { redirect: "manual" });
    assert.equal(response.status, 301, `${path}: permanent migration`);
    const destination = new URL(response.headers.get("location"), origin);
    assert.equal(destination.origin, origin.origin);
    assert.equal(destination.pathname, "/docs/getting-started");
    assert.equal(destination.hash, "", "Location must not replace historical section fragments");
    await response.body?.cancel();
  }
  for (const path of ["/not-a-real-page", "/nested/not-a-real-page", "/docs/not-a-real-article"]) {
    const response = await fetch(new URL(path, origin));
    assert.equal(response.status, 404, `${path}: real 404`);
    assert((await response.text()).includes("这个页面没有找到。"));
  }
  for (const path of ["/sitemap.xml", "/robots.txt", "/og-image.png", "/favicon.svg"]) {
    const response = await fetch(new URL(path, origin));
    assert.equal(response.status, 200, `${path}: asset`);
    await response.body?.cancel();
  }
}
console.log("SEO checks passed: rendered pages, metadata, indexing boundaries and social image.");
