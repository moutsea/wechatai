import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";
import { AVAILABLE_LOCALES, DASHBOARD_PATH, DEFAULT_LOCALE, LOCALE_DEFINITIONS, localizedPath, splitLocalePath } from "../src/shared/i18n/index.ts";
import { museGuide } from "../src/shared/muse-docs.ts";

// Verify the actual deployable output; metadata-only tests cannot catch an empty SPA shell.
const dir = new URL("../dist/client/", import.meta.url);
const read = (name) => readFile(new URL(name, dir), "utf8");
const {
  module: { alternateLinks, defaultLocale, locale404Probes, localePageGroups },
} = await runnerImport(fileURLToPath(new URL("./locale-expectations.ts", import.meta.url)));
const localeByPath = new Map(localePageGroups.flat().map((page) => [page.path, page]));
const publicPaths = [...localeByPath.keys()];
const dashboardLocales = new Map(
  AVAILABLE_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).map((locale) => [
    localizedPath(locale, DASHBOARD_PATH), LOCALE_DEFINITIONS[locale].htmlLang,
  ]),
);
const {
  module: { default: portugueseDashboard },
} = await runnerImport(
  fileURLToPath(new URL("../src/shared/i18n/pt/dashboard.ts", import.meta.url)),
);
for (const page of portugueseDashboard) {
  dashboardLocales.set(localizedPath("pt", page.path), LOCALE_DEFINITIONS.pt.htmlLang);
}
const htmlFile = (path) => (path === "/" ? "index.html" : `${path.slice(1)}.html`);
const museIndexLinks = [
  "(https://wechatai.app/wechat-muse)",
  "(https://wechatai.app/developers/muse)",
];
const workerDocuments = [
  ["/developers/plugins.md", "text/markdown", "给 AI agent 的起点"],
  ["/developers/openclaw.md", "text/markdown", "# OpenClaw 接入指南"],
  ["/developers/muse.md", "text/markdown", "# Muse 接入指南"],
  ["/developers/hermes.md", "text/markdown", "# Hermes 接入指南"],
  ["/developers/notifications.md", "text/markdown", "# 消息提醒 HTTP 接入"],
  ["/llms.txt", "text/plain", "# Wechatai", ...museIndexLinks],
  ["/llms-full.txt", "text/plain", "# Wechatai", ...museIndexLinks],
];
// These are dynamic responses. An asset-first navigation otherwise returns the
// static 404 page even when a direct Worker unit test passes.
const builtConfig = JSON.parse(
  await readFile(new URL("../dist/wechatai/wrangler.json", import.meta.url), "utf8"),
);
const workerFirst = builtConfig.assets.run_worker_first;
for (const [path] of workerDocuments) {
  assert(
    workerFirst === true || (Array.isArray(workerFirst) && workerFirst.includes(path)),
    `${path}: Worker route in build`,
  );
}
const publicPages = [
  ["index.html", "https://wechatai.app/", "把你的 AI"],
  ["docs.html", "https://wechatai.app/docs", "跟着教程配置"],
  ...[
    ["getting-started", "四、启动插件（可选）"],
    ["channels-models", "三、调整回答风格与用量"],
    ["model-providers", "KimiSeek 一键导入"],
    ["wechat-connection", "管理多个链接"],
    ["commands", "命令一览"],
    ["sessions", "长对话怎么处理？"],
    ["attachments", "先发附件，再说要求"],
    ["credits", "邀请好友，获得永久 credits"],
    ["faq", "模型自称和我的配置不一样？"],
    ["ds-chat", "配置模型与搜索服务"],
    ["image-generation", "描述画面和比例"],
    ["roleplay", "角色卡是什么，怎么导入"],
    ["personal-assistant", "定时提醒"],
    ["cloud-agent", "查看进度、结果与停止任务"],
    ["notifications", "发送第一条通知"],
  ].map(([slug, marker]) => [`docs/${slug}.html`, `https://wechatai.app/docs/${slug}`, marker]),
  [
    "docs/wechat-ai-assistant.html",
    "https://wechatai.app/docs/wechat-ai-assistant",
    "第二步：在微信把 Markdown 转成 Word",
  ],
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
  ["developers/muse.html", "https://wechatai.app/developers/muse", "Muse 接入指南"],
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
  [
    "wechat-clawbot.html",
    "https://wechatai.app/wechat-clawbot",
    "微信 ClawBot 插件：入口、绑定与不回复排查",
  ],
  [
    "wechat-muse.html",
    "https://wechatai.app/wechat-muse",
    "微信接入 Muse 托管助理：连接、切换与不回复排查",
  ],
  [
    "wechat-ai-ban-risk.html",
    "https://wechatai.app/wechat-ai-ban-risk",
    "微信用 AI 会被封号吗：三类接法的风险差异",
  ],
  [
    "wechat-clawbot-models.html",
    "https://wechatai.app/wechat-clawbot-models",
    "微信 ClawBot 支持哪些模型？",
  ],
  [
    "bring-your-own-api-key.html",
    "https://wechatai.app/bring-your-own-api-key",
    "用自己的 API Key，把 AI 接进微信",
  ],
  [
    "wechat-deepseek.html",
    "https://wechatai.app/wechat-deepseek",
    "想在微信里用 DeepSeek？从这里开始",
  ],
  ["wechat-claude.html", "https://wechatai.app/wechat-claude", "微信接入 Claude：绕开桥接的那条路"],
  ["wechat-gpt.html", "https://wechatai.app/wechat-gpt", "微信接入 GPT：跳过部署这一步"],
  [
    "wechat-kimi.html",
    "https://wechatai.app/wechat-kimi",
    "微信接入 Kimi：从 KimiSeek 一键导入开始",
  ],
  ["wechat-qwen.html", "https://wechatai.app/wechat-qwen", "微信接入通义千问：用硅基流动渠道跑通"],
  ["wechat-glm.html", "https://wechatai.app/wechat-glm", "微信接入 GLM：用硅基流动渠道配置"],
  ["wechat-agent.html", "https://wechatai.app/wechat-agent", "把 Agent 接进微信，而不只是模型"],
  [
    "wechat-ai-options.html",
    "https://wechatai.app/wechat-ai-options",
    "微信 AI 怎么选：四类方案的真实取舍",
  ],
  [
    "compare.html",
    "https://wechatai.app/compare",
    "微信 AI 对比：先看三类方案再选",
  ],
  [
    "compare/wechatai-vs-wechat-official-ai.html",
    "https://wechatai.app/compare/wechatai-vs-wechat-official-ai",
    "微伴 vs 微信官方内置 AI：先分清你要的是哪一类能力",
  ],
  [
    "compare/wechatai-vs-openclaw.html",
    "https://wechatai.app/compare/wechatai-vs-openclaw",
    "微伴 vs 自建 OpenClaw：把运行和维护也算进成本",
  ],
  [
    "compare/wechatai-vs-commercial-wechat-ai.html",
    "https://wechatai.app/compare/wechatai-vs-commercial-wechat-ai",
    "微伴 vs 商业微信 AI 平台：费用和模型归谁管",
  ],
  [
    "wechat-ai-partner.html",
    "https://wechatai.app/wechat-ai-partner",
    "微信 AI 搭档：聊天框里的固定搭子",
  ],
  [
    "wechat-character-card.html",
    "https://wechatai.app/wechat-character-card",
    "微信角色卡导入教程：PNG、V2 JSON 与兼容说明",
  ],
  ["wechat-bot.html", "https://wechatai.app/wechat-bot", "微信机器人怎么弄：先选对路线"],
  ["wechat-ai-image.html", "https://wechatai.app/wechat-ai-image", "在微信里生成图片：配置与计费"],
  [
    "wechat-ai-privacy.html",
    "https://wechatai.app/wechat-ai-privacy",
    "微信 AI 的隐私：三条链路逐个说清",
  ],
  ["pricing.html", "https://wechatai.app/pricing", "免费开始，按需升级 Plus"],
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
    const tutorialFigures = {
      "docs/wechat-ai-assistant.html": ["小薇配置与使用示意"],
      "docs/deepseek-in-wechat.html": ["DeepSeek微信对话示意"],
      "docs/multiple-openclaw-in-wechat.html": [
        "OpenClaw连接操作示意",
        "OpenClaw 两组配置与独立快捷名称示意",
        "OpenClaw微信对话示意",
      ],
      "docs/hermes-in-wechat.html": ["Hermes连接操作示意", "Hermes微信对话示意"],
    };
    for (const label of tutorialFigures[file] ?? []) {
      assert(
        html.includes(`aria-label="${label}"`),
        `${file}: ${label} rendered before JavaScript`,
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
  // 直接回答块可带页面修饰类，按 class 名匹配。
  assert(/class="[^"]*\bseopage-answer\b[^"]*"/.test(html), `${file}: direct answer block`);
  assert(html.includes('id="faq"'), `${file}: FAQ section`);
  assert(html.includes(`<h1>${marker}</h1>`), `${file}: landing heading from page data`);
  const graph = JSON.parse(
    html.match(/<script type="application\/ld\+json" data-seo>(.*?)<\/script>/)[1],
  )["@graph"];
  assert(
    graph.some((item) => item["@type"] === "BreadcrumbList"),
    `${file}: breadcrumb data`,
  );
  assert(
    graph.some((item) => item["@type"] === "FAQPage"),
    `${file}: FAQ data`,
  );
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
// The five Portuguese URLs must carry their own prerendered body, not a shell.
for (const [file, marker] of [
  ["pt.html", "Leve sua IA"],
  ["pt/pricing.html", "Comece grátis e faça upgrade para o Plus quando precisar"],
  ["pt/wechat-ai.html", "WeChat AI: leve seu próprio modelo para o chat do WeChat"],
  ["pt/wechat-bot.html", "Como criar um bot para WeChat: escolha a rota certa primeiro"],
  ["pt/wechat-deepseek.html", "Quer usar DeepSeek no WeChat? Comece aqui"],
]) {
  const html = await read(file);
  assert(html.includes(marker), `${file}: Portuguese body before JavaScript`);
  assert(!html.includes("这个页面没有找到。"), `${file}: not the 404 page`);
}

const englishClawbot = await read("en/wechat-clawbot.html");
assert.match(
  englishClawbot.match(/<ul class="seopage-highlights">.*?<\/ul>/s)?.[0] ?? "",
  /Binding takes about 30 seconds/,
  "ClawBot: binding duration, not link expiry",
);

const englishClawbotModels = await read("en/wechat-clawbot-models.html");
const featureTestStep = englishClawbotModels.match(
  /<li><strong>Test other features as needed<\/strong>:[\s\S]*?<\/li>/,
)?.[0] ?? "";
assert.match(featureTestStep, /you need Plus/i, "ClawBot models: Plus required to test attachments");
assert.match(
  featureTestStep,
  /text chat, skip the attachment test/i,
  "ClawBot models: text-only users skip attachment testing",
);

const englishWechatAi = await read("en/wechat-ai.html");
const aiDescription = englishWechatAi.match(/<meta name="description" content="([^"]+)"/)?.[1];
assert(aiDescription, "WeChat AI: English meta description");
assert.match(aiDescription, /Xiaowei uses your own model/, "WeChat AI: bring-your-own model");
assert.match(aiDescription, /consumes credits/, "WeChat AI: Xiaowei credit usage");
assert.match(aiDescription, /limits task runs/, "WeChat AI: Xiaowei execution limit");
assert(
  englishWechatAi.includes(`<meta property="og:description" content="${aiDescription}"`),
  "WeChat AI: OG description matches meta description",
);
const aiGraph = JSON.parse(
  englishWechatAi.match(/<script type="application\/ld\+json" data-seo>(.*?)<\/script>/)[1],
)["@graph"];
assert.equal(
  aiGraph.find((item) => item["@type"] === "WebPage")?.description,
  aiDescription,
  "WeChat AI: JSON-LD description matches meta description",
);

const englishQwen = await read("en/wechat-qwen.html");
const qwenAnswer = englishQwen.match(/<section[^>]+id="faq"[^>]*>.*?<details>.*?<p>(.*?)<\/p>/s)?.[1];
assert(qwenAnswer, "Qwen: first visible FAQ answer");
assert.match(
  qwenAnswer,
  /preset fills in the Beijing endpoint\. Enter your own API key and save the channel, then sync available models or add a model manually/,
  "Qwen: preset supplies the endpoint; enter a key, save, and sync or add a model",
);
assert.match(
  qwenAnswer,
  /another region or a dedicated endpoint, choose Custom first and enter the endpoint from the provider documentation/,
  "Qwen: other endpoints require Custom mode",
);
const qwenGraph = JSON.parse(
  englishQwen.match(/<script type="application\/ld\+json" data-seo>(.*?)<\/script>/)[1],
)["@graph"];
assert.equal(
  qwenGraph.find((item) => item["@type"] === "FAQPage")?.mainEntity[0]?.acceptedAnswer.text,
  qwenAnswer,
  "Qwen: first FAQ JSON-LD answer matches the visible answer",
);

// /pricing must ship plan offers and a machine-readable price check date in the
// static HTML, not only after client JavaScript runs.
const pricingHtml = await read("pricing.html");
const pricingGraph = JSON.parse(
  pricingHtml.match(/<script type="application\/ld\+json" data-seo>(.*?)<\/script>/)[1],
)["@graph"];
const pricingService = pricingGraph.find((item) => item["@type"] === "Service");
assert(pricingService, "pricing: Service node");
assert(pricingService.offers.length >= 3, "pricing: free and Plus offers");
for (const offer of pricingService.offers) {
  assert.equal(
    offer.priceSpecification?.["@type"],
    "UnitPriceSpecification",
    `pricing: ${offer.name} unit price specification`,
  );
}
assert.match(
  pricingHtml,
  /价格核查于(?:<!-- -->)?\s*<time [^>]*(?:datetime|dateTime)="\d{4}-\d{2}-\d{2}">\d{4}-\d{2}-\d{2}<\/time>/,
  "pricing: rendered price check date",
);
const legacy = await read("guide.html");
assert(
  !legacy.includes('content="noindex, follow"'),
  "legacy canonical does not conflict with noindex",
);
assert(legacy.includes('rel="canonical" href="https://wechatai.app/docs/getting-started"'));
assert(legacy.includes("四、启动插件（可选）"), "legacy guide has a usable no-JS fallback");
assert(legacy.includes('href="/docs/commands"'), "legacy guide exposes command reference");
const sitemap = await read("sitemap.xml");
assert(!sitemap.includes("https://wechatai.app/guide"));
const redirectRules = await read("_redirects");
// Cloudflare counts every rule after the first splat or placeholder as dynamic and
// drops whatever exceeds 100 of them, so the canonical aliases must stay static.
const ruleLines = redirectRules
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));
const dynamicStart = ruleLines.findIndex((rule) => /[*:]/.test(rule.split(/\s+/)[0]));
assert(dynamicStart >= 0, "_redirects keeps the splat rewrite");
assert(ruleLines.length - dynamicStart <= 100, "_redirects stays within 100 dynamic rules");
const staticRuleIndex = new Map(ruleLines.map((rule, index) => [rule, index]));
for (const path of ["/guide", "/guide/", "/guide.html"]) {
  assert(
    redirectRules.includes(`${path} /docs/getting-started 301`),
    `${path}: permanent guide redirect without overriding fragment`,
  );
}
for (const path of publicPaths) {
  for (const alias of path === "/" ? ["/index.html"] : [`${path}/`, `${path}.html`]) {
    assert(
      redirectRules.includes(`${alias} ${path} 301`),
      `${alias}: permanent redirect to canonical URL`,
    );
    assert(
      staticRuleIndex.get(`${alias} ${path} 301`) < dynamicStart,
      `${alias}: canonical redirect precedes the dynamic rules`,
    );
  }
}
const docsIndex = await read("docs.html");
for (const [file] of publicPages.filter(([file]) => file.startsWith("docs/"))) {
  assert(
    docsIndex.includes(`href="/${file.slice(0, -5)}"`),
    `${file}: discoverable from docs index`,
  );
}
// Every registered English article is prerendered with its own English body, not
// a shell that resolves client-side, and the English index links all of them.
const englishIndex = await read("en/docs.html");
assert(englishIndex.includes("Put your AI to work in WeChat."), "en/docs: English index heading");
for (const [slug, marker] of [
  ["getting-started", "1. How Wechatai works"],
  ["channels-models", "1. Add a model channel"],
  ["model-providers", "KimiSeek one-click import"],
  ["wechat-connection", "1. Connect WeChat by QR code"],
  ["commands", "Command list"],
  ["sessions", "Create, switch and clean up"],
  ["attachments", "1. Send the attachment first"],
  ["credits", "1. Free or Plus?"],
  ["faq", "It connects, but why do I get no reply?"],
  ["cloud-agent", "1. Enable Xiaowei"],
  ["ds-chat", "1. Configure the model and search service"],
  ["image-generation", "1. Configure an image service"],
  ["roleplay", "How can I play?"],
  ["personal-assistant", "1. Configure and start"],
  ["notifications", "1. Connect WeChat and generate a dedicated token"],
  ["wechat-ai-assistant", "What can an AI assistant in WeChat do for you?"],
  ["deepseek-in-wechat", "Before starting, confirm two things"],
  ["multiple-openclaw-in-wechat", "First decide where the two assistants come from"],
  ["hermes-in-wechat", "Step 1: prepare Hermes"],
]) {
  const file = `en/docs/${slug}.html`;
  const html = await read(file);
  assert(html.includes('<html lang="en">'), `${file}: English document language`);
  assert(html.includes(marker), `${file}: English article body before JavaScript`);
  assert(
    html.includes(`rel="canonical" href="https://wechatai.app/en/docs/${slug}"`),
    `${file}: English canonical`,
  );
  assert(englishIndex.includes(`href="/en/docs/${slug}"`), `${file}: listed in English index`);
}
// 文档导航与开发者索引都要直达同一份 Muse 指南，且正文包含全部章节与 FAQ；
// `/developers/muse.md` 由同一份 museGuide 提供，Worker 测试按同一清单断言。
assert(docsIndex.includes('href="/developers/muse"'), "docs navigation links the Muse guide");
const museHtml = await read("developers/muse.html");
const museSections = museGuide
  .split(/^## /m)
  .slice(1)
  .map((section) => section.split("\n")[0]);
assert.equal(museSections.length, 8, "Muse guide has seven content sections and an FAQ section");
for (const heading of museSections)
  assert(museHtml.includes(heading), `Muse guide HTML: ${heading}`);
const museFaqQuestions = [...museGuide.split("## 8. 常见问题")[1].matchAll(/^### (.+)$/gm)].map(
  (match) => match[1],
);
assert.equal(museFaqQuestions.length, 6, "Muse guide has six FAQs");
for (const question of museFaqQuestions)
  assert(museHtml.includes(question), `Muse guide HTML: ${question}`);
const pluginsIndex = await read("developers/plugins.html");
assert(pluginsIndex.includes('href="/developers/muse"'), "plugins index links the Muse guide");
// Muse 承接页与指南必须双向可达；主题页、对比页、定价页和首页都要有明确入口。
for (const [file, marker] of [
  ["index.html", "homepage"],
  ["pricing.html", "pricing"],
  ["wechat-clawbot.html", "ClawBot"],
  ["wechat-agent.html", "Agent"],
  ["wechat-ai-options.html", "options"],
  ["compare/wechatai-vs-wechat-official-ai.html", "official comparison"],
  ["compare/wechatai-vs-openclaw.html", "OpenClaw comparison"],
  ["compare/wechatai-vs-commercial-wechat-ai.html", "commercial comparison"],
  ["developers/muse.html", "Muse guide"],
]) {
  const html = await read(file);
  assert(html.includes('href="/wechat-muse"'), `${marker}: links /wechat-muse`);
  if (file === "developers/muse.html") {
    assert(html.includes("面向站内读者的完整接入与排错说明"), "Muse guide: landing link context");
  }
}
const museLandingHtml = await read("wechat-muse.html");
for (const href of [
  "/developers/muse",
  "/app/plugins",
  "/pricing",
  "/wechat-agent",
  "/wechat-ai-options",
  "/compare/wechatai-vs-wechat-official-ai",
  "/compare/wechatai-vs-openclaw",
  "/compare/wechatai-vs-commercial-wechat-ai",
]) {
  assert(museLandingHtml.includes(`href="${href}"`), `Muse landing: links ${href}`);
}
// 两页的 OG 字段必须与页面自身的 title/description/canonical 一致。
for (const [file, canonical] of [
  ["wechat-muse.html", "https://wechatai.app/wechat-muse"],
  ["developers/muse.html", "https://wechatai.app/developers/muse"],
]) {
  const html = await read(file);
  const title = html.match(/<title[^>]*>(.*?)<\/title>/s)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  assert(title && description, `${file}: title and description`);
  assert(html.includes(`property="og:url" content="${canonical}"`), `${file}: og:url`);
  assert(html.includes(`property="og:title" content="${title}"`), `${file}: og:title`);
  assert(
    html.includes(`property="og:description" content="${description}"`),
    `${file}: og:description`,
  );
}
// 指南的可见问答段落必须同时发布为 FAQPage，并与 Article 指向同一 URL。
const museGuideGraph = JSON.parse(
  (await read("developers/muse.html")).match(
    /<script type="application\/ld\+json" data-seo>(.*?)<\/script>/,
  )[1],
)["@graph"];
const museArticle = museGuideGraph.find((item) => item["@type"] === "Article");
assert(museArticle?.url === "https://wechatai.app/developers/muse", "Muse guide: Article url");
assert(
  museArticle?.headline === "Muse 接入指南",
  "Muse guide: Article headline matches the visible H1",
);
const museGuideFaq = museGuideGraph.find((item) => item["@type"] === "FAQPage");
assert.equal(museGuideFaq?.mainEntity.length, 6, "Muse guide: FAQPage covers six visible answers");
for (const question of museFaqQuestions) {
  assert(
    museGuideFaq.mainEntity.some((item) => item.name === question),
    `Muse guide FAQPage: ${question}`,
  );
}
await access(new URL("developers/muse.html", dir));
// 统一页头之后顶部导航是 .site-header-nav；文档与价格都必须能从首页直接点进去，
// 否则「价格」只能靠页脚和正文露出。
for (const target of ['href="/docs"', 'href="/pricing"'])
  assert((await read("index.html")).includes(target), `homepage navigation includes ${target}`);
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
  "app/tasks.html",
  "app/notices.html",
  "app/credits.html",
  "app/admin.html",
  ...[...dashboardLocales.keys()].map(htmlFile),
  "404.html",
]) {
  const html = await read(file);
  assert(html.includes('content="noindex, follow"'), `${file}: noindex`);
  assert(!html.includes('rel="canonical"'), `${file}: no public canonical`);
}
for (const [path, lang] of dashboardLocales) {
  const html = await read(htmlFile(path));
  assert(html.includes(`<html lang="${lang}">`), `${path}: HTML lang`);
  assert(!html.includes("hreflang="), `${path}: no public hreflang`);
  assert(!html.includes("正在加载微伴工作台"), `${path}: localized loading text`);
}
assert((await read("404.html")).includes("这个页面没有找到。"));
const robots = await read("robots.txt");
assert(robots.includes("Sitemap: https://wechatai.app/sitemap.xml"));
const robotsGroups = [];
let robotsGroup = null;
for (const raw of robots.split("\n")) {
  const line = raw.replace(/#.*/, "").trim();
  if (!line) continue;
  const separator = line.indexOf(":");
  if (separator < 0) continue;
  const directive = line.slice(0, separator).trim().toLowerCase();
  const value = line.slice(separator + 1).trim();
  if (directive === "user-agent") {
    if (!robotsGroup || robotsGroup.rules.length > 0) {
      robotsGroup = { agents: [], rules: [] };
      robotsGroups.push(robotsGroup);
    }
    robotsGroup.agents.push(value.toLowerCase());
  } else if ((directive === "allow" || directive === "disallow") && robotsGroup) {
    robotsGroup.rules.push({ directive, path: value });
  }
}
const robotsRules = (agent) => {
  const group = robotsGroups.find((item) => item.agents.includes(agent.toLowerCase()));
  assert(group, `${agent}: robots.txt group missing`);
  return group.rules;
};
const robotsBlocksAll = (agent) =>
  robotsRules(agent).some((rule) => rule.directive === "disallow" && rule.path === "/");
for (const agent of [
  "OAI-SearchBot",
  "Claude-SearchBot",
  "PerplexityBot",
  "Bingbot",
  "Googlebot",
]) {
  assert(!robotsBlocksAll(agent), `${agent}: search crawler allowed`);
  assert(
    robotsRules(agent).some((rule) => rule.directive === "allow" && rule.path === "/"),
    `${agent}: explicit allow`,
  );
}
for (const agent of [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "CCBot",
  "Applebot-Extended",
  "Bytespider",
  "Amazonbot",
  "Meta-ExternalAgent",
  "cohere-ai",
  "Diffbot",
]) {
  assert(robotsBlocksAll(agent), `${agent}: training crawler disallowed`);
  assert(
    !robotsRules(agent).some((rule) => rule.directive === "allow" && rule.path === "/"),
    `${agent}: no conflicting allow`,
  );
}
assert(!robotsBlocksAll("*"), "wildcard: public site allowed");
assert(
  robotsRules("*").some((rule) => rule.directive === "disallow" && rule.path === "/api/"),
  "wildcard: API disallowed",
);
assert(
  robotsRules("*").some(
    (rule) => rule.directive === "allow" && rule.path === "/api/plugins/protocol",
  ),
  "wildcard: protocol API allowed",
);
const translations = localePageGroups.flatMap(([, ...translated]) => translated);
assert.deepEqual(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url).sort(),
  [
    ...publicPages.map(([, canonical]) => canonical),
    ...translations.map(({ canonical }) => canonical),
  ].sort(),
  "sitemap: exactly the public Chinese and registered localized URLs",
);
const localizedFiles = (await readdir(dir, { recursive: true })).filter(
  (file) => file.endsWith(".html") && splitLocalePath(`/${file.slice(0, -5)}`),
);
assert.deepEqual(
  localizedFiles.sort(),
  [...translations.map(({ path }) => htmlFile(path)), ...[...dashboardLocales.keys()].map(htmlFile)].sort(),
  "localized HTML: exactly the registered public URLs and private dashboard shells",
);
for (const group of localePageGroups) {
  for (const expected of group) {
    const { path, htmlLang, ogLocale, canonical, lastmod } = expected;
    const html = await read(htmlFile(path));
    assert(html.includes(`<html lang="${htmlLang}">`), `${path}: HTML lang`);
    assert(html.includes(`property="og:locale" content="${ogLocale}"`), `${path}: og:locale`);
    assert.deepEqual(
      [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map(([, href]) => href),
      [canonical],
      `${path}: single self canonical`,
    );
    assert.deepEqual(
      [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map(
        ([, lang, href]) => [lang, href],
      ),
      alternateLinks(group),
      `${path}: hreflang lists exactly the published page group`,
    );
    if (group.length === 1) {
      assert(
        !html.includes('class="site-language"'),
        `${path}: no switcher without a published translation`,
      );
    } else {
      const navigation =
        htmlLang === "ko-KR"
          ? "언어"
          : htmlLang === "ja-JP"
            ? "言語"
            : htmlLang === "en"
              ? "Language"
              : htmlLang === "pt-BR" || htmlLang === "es"
                ? "Idioma"
                : "语言";
      const separator = htmlLang === "en" ? ": " : "：";
      const trigger = `<button type="button" class="site-language-trigger" aria-haspopup="menu" aria-expanded="false" aria-label="${navigation}${separator}${expected.label}">`;
      assert.equal(
        html.split(trigger).length - 1,
        2,
        `${path}: closed switcher trigger in the desktop header and mobile drawer`,
      );
      assert(
        html.includes(`${trigger}<span>${expected.label}</span>`),
        `${path}: switcher trigger shows the current language`,
      );
      assert(!html.includes('class="site-language-menu"'), `${path}: switcher menu starts closed`);
    }
    if (path.startsWith("/en/wechat-")) {
      const graph = JSON.parse(
        html.match(/<script type="application\/ld\+json" data-seo>(.*?)<\/script>/)[1],
      )["@graph"];
      const { publisher } = graph.find(
        (item) => item["@type"] === "WebPage" || item["@type"] === "Article",
      );
      assert.equal(publisher["@id"], "https://wechatai.app/#organization", `${path}: publisher ID`);
      assert.match(publisher.description, /WeChat ClawBot/, `${path}: publisher description`);
      assert.doesNotMatch(publisher.description, /\p{Script=Han}/u, `${path}: English publisher`);
    }
    if (path.startsWith("/pt/")) {
      const graph = JSON.parse(
        html.match(/<script type="application\/ld\+json" data-seo>(.*?)<\/script>/)[1],
      )["@graph"];
      const { publisher } = graph.find(
        (item) => item["@type"] === "WebPage" || item["@type"] === "Article",
      );
      assert.equal(publisher["@id"], "https://wechatai.app/#organization", `${path}: publisher ID`);
      assert.match(publisher.description, /WeChat ClawBot/, `${path}: publisher description`);
      assert.doesNotMatch(
        publisher.description,
        /\p{Script=Han}/u,
        `${path}: Portuguese publisher`,
      );
    }
    if (lastmod) {
      assert(
        sitemap.includes(`<loc>${canonical}</loc><lastmod>${lastmod}</lastmod>`),
        `${path}: lastmod`,
      );
      assert.equal((html.match(/<h1\b/g) || []).length, 1, `${path}: rendered page heading`);
      assert(!html.includes("这个页面没有找到。"), `${path}: not the 404 page`);
      assert(html.includes('content="index, follow, max-image-preview:large"'), `${path}: indexable`);
    }
  }
}
const image = await readFile(new URL("og-image.png", dir));
assert.equal(image.subarray(1, 4).toString(), "PNG");
assert.equal(image.readUInt32BE(16), 1200);
assert.equal(image.readUInt32BE(20), 630);

// Optional deployment/preview smoke check: node scripts/verify-seo.mjs http://127.0.0.1:5174
if (process.argv[2]) {
  const origin = new URL(process.argv[2]);
  for (const [path, contentType, ...markers] of workerDocuments) {
    for (const headers of [{}, { "sec-fetch-mode": "navigate" }]) {
      const response = await fetch(new URL(path, origin), { headers, redirect: "manual" });
      assert.equal(response.status, 200, `${path}: public document status`);
      assert(
        response.headers.get("content-type")?.startsWith(contentType),
        `${path}: document content type`,
      );
      const body = await response.text();
      for (const marker of markers) {
        assert(body.includes(marker), `${path}: document body contains ${marker}`);
      }
    }
  }
  for (const path of [
    ...publicPaths,
    "/login",
    "/register",
    "/app",
    "/app/channels",
    "/app/assistants",
    "/app/wechat",
    "/app/sessions",
    "/app/plugins",
    "/app/tasks",
    "/app/tasks/deployment-smoke",
    "/app/tasks/deployment-smoke?plugin=smoke&cursor=smoke",
    "/app/notices",
    "/app/billing",
    "/app/credits",
    ...dashboardLocales.keys(),
    "/pt/app/tasks/deployment-smoke?plugin=smoke&cursor=smoke",
  ]) {
    const response = await fetch(new URL(path, origin), { redirect: "manual" });
    assert.equal(response.status, 200, `${path}: status`);
    const html = await response.text();
    const expectedLocale = localeByPath.get(new URL(path, origin).pathname);
    const htmlLang =
      dashboardLocales.get(path) ??
      (path.startsWith("/pt/app/tasks/")
        ? LOCALE_DEFINITIONS.pt.htmlLang
        : expectedLocale?.htmlLang ?? defaultLocale.htmlLang);
    assert(html.includes(`<html lang="${htmlLang}">`), `${path}: HTML lang`);
    if (expectedLocale) {
      assert(
        html.includes(`property="og:locale" content="${expectedLocale.ogLocale}"`),
        `${path}: og locale`,
      );
    } else {
      assert.match(response.headers.get("x-robots-tag") || "", /noindex/, `${path}: header`);
      assert(html.includes('content="noindex, follow"'), `${path}: noindex HTML`);
    }
  }
  for (const path of publicPaths) {
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
  for (const path of [
    "/not-a-real-page",
    "/nested/not-a-real-page",
    "/docs/not-a-real-article",
    ...locale404Probes,
  ]) {
    const response = await fetch(new URL(path, origin), { redirect: "manual" });
    assert.equal(response.status, 404, `${path}: real 404`);
    assert.equal(response.headers.get("location"), null, `${path}: no redirect to Chinese`);
    const body = await response.text();
    assert(body.includes("这个页面没有找到。"), `${path}: 404 body`);
    for (const marker of ["把你的 AI", "免费开始，按需升级 Plus"]) {
      assert(!body.includes(marker), `${path}: does not render Chinese page ${marker}`);
    }
  }
  for (const path of ["/sitemap.xml", "/robots.txt", "/og-image.png", "/favicon.svg"]) {
    const response = await fetch(new URL(path, origin));
    assert.equal(response.status, 200, `${path}: asset`);
    await response.body?.cancel();
  }
}
console.log("SEO checks passed: rendered pages, metadata, indexing boundaries and social image.");
