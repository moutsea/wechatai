import { createExecutionContext, env } from "cloudflare:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import worker from "../src/server/index";
import { protocolIndex, protocolJsonSchema } from "../src/server/plugin-docs";
import {
  LLMS_FULL_PATH,
  PLUGIN_API_PATH,
  PLUGIN_MARKDOWN_PATH,
  PLUGIN_SCHEMA_PATH,
  PLUGIN_VERSION_PATH,
  protocolExamples,
  protocolLinks,
  protocolMarkdown,
  protocolSections,
} from "../src/shared/plugin-docs";
import { llmsFullText } from "../src/shared/llms-docs";
import { PLUGIN_PROTOCOL_VERSION, pluginResultSchema } from "../src/shared/plugins";
import { SEO_PAGES } from "../src/shared/seo-pages";
import { DOC_ARTICLES, docPath } from "../src/shared/docs";
import { SITE_URL } from "../src/shared/seo";

const request = (path: string, init?: RequestInit, bindings: Env = env) =>
  worker.fetch(
    new Request(`https://wechatai.app${path}`, init),
    bindings,
    createExecutionContext(),
  );

describe("public plugin developer resources", () => {
  it("serves current and versioned metadata without auth or any account bindings", async () => {
    for (const path of [PLUGIN_API_PATH, PLUGIN_VERSION_PATH]) {
      const response = await request(
        path,
        { headers: { origin: "https://agent.example", cookie: "unrelated=ignored" } },
        {} as Env,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.has("access-control-allow-credentials")).toBe(false);
      expect(response.headers.has("set-cookie")).toBe(false);
      expect(response.headers.get("cache-control")).toBe("public, max-age=300");
      const data = await response.json<typeof protocolIndex>();
      expect(data).toEqual(protocolIndex);
      expect(data.availability.publicInvocationApi).toBe(false);
      expect(data.billing.trustsPluginUsage).toBe(false);
      expect(data.billing.tokensPerCredit).toBe(5000);
    }
  });

  it("returns real Markdown and plain discovery text instead of a login page or SPA", async () => {
    const markdown = await request(PLUGIN_MARKDOWN_PATH, undefined, {} as Env);
    expect(markdown.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(await markdown.text()).toBe(protocolMarkdown);
    expect(protocolMarkdown).toContain("## 最小适配示例");
    expect(protocolMarkdown).toContain("图片生成与媒体交付接口");
    const discovery = await request("/llms.txt", undefined, {} as Env);
    expect(discovery.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await discovery.text()).toContain(protocolLinks.markdown);
    expect(new Set(protocolSections.map((s) => s.id)).size).toBe(protocolSections.length);
    expect(protocolSections.map((s) => s.id)).toContain("quickstart");
  });

  it.each(["/llms.txt", LLMS_FULL_PATH])(
    "explains the connection prerequisites in %s",
    async (path) => {
      const response = await request(path, undefined, {} as Env);
      const facts = (await response.text()).split("## 产品事实")[1].split("\n## ")[0];
      expect(facts).toMatch(/^- 绑定微信：.*二维码.*\/wx help/m);
      expect(facts).toMatch(/^- 普通模型聊天：.*API Key.*测试连接.*计费/m);
      expect(facts).toMatch(/^- 已有 Agent：.*Muse.*OpenClaw.*Hermes.*无需在微伴另配模型/m);
      expect(facts).toMatch(/^- 只收通知：.*Token.*无需模型 API Key/m);
    },
  );

  it("serves the full index with every landing page, document summary and protocol entry", async () => {
    const discovery = await request("/llms.txt", undefined, {} as Env);
    expect(await discovery.text()).toContain(protocolLinks.fullDiscovery);
    const response = await request(LLMS_FULL_PATH, undefined, {} as Env);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const text = await response.text();
    expect(text).toBe(llmsFullText);
    for (const page of SEO_PAGES) {
      expect(text, page.path).toContain(`${SITE_URL}${page.path}`);
      expect(text, page.path).toContain(page.description);
    }
    for (const article of DOC_ARTICLES) {
      expect(text, article.slug).toContain(`${SITE_URL}${docPath(article.slug)}`);
      expect(text, article.slug).toContain(article.description);
    }
    for (const link of [
      protocolLinks.markdown,
      protocolLinks.documentation,
      protocolLinks.api,
      protocolLinks.schema,
    ]) {
      expect(text).toContain(link);
    }
    expect(text).toContain("## 价格事实");
    expect(text).toContain("AI 生图每张");
  });

  it("distinguishes new purchases from existing auto-renewals in the full index pricing facts", async () => {
    const response = await request(LLMS_FULL_PATH, undefined, {} as Env);
    const pricingFacts = (await response.text())
      .split(/^## /m)
      .find((section) => section.startsWith("价格事实\n"));
    expect(pricingFacts).toContain("新购买的会员为单次付费，不自动续费");
    expect(pricingFacts).toContain("已有自动续费订阅可在「管理订阅」中取消");
  });

  it("supports HEAD, CORS preflight and conditional reads", async () => {
    for (const path of [
      PLUGIN_API_PATH,
      PLUGIN_MARKDOWN_PATH,
      PLUGIN_SCHEMA_PATH,
      "/llms.txt",
      LLMS_FULL_PATH,
    ]) {
      const first = await request(path);
      const tag = first.headers.get("etag");
      expect(tag).toBeTruthy();
      const cached = await request(path, { headers: { "if-none-match": tag! } });
      expect(cached.status).toBe(304);
      expect(await cached.text()).toBe("");
      const head = await request(path, { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
      const options = await request(path, {
        method: "OPTIONS",
        headers: { origin: "https://agent.example", "access-control-request-method": "GET" },
      });
      expect(options.status).toBe(204);
      expect(options.headers.get("access-control-allow-methods")).toContain("GET");
      expect(options.headers.get("access-control-allow-methods")).not.toContain("POST");
    }
  });

  it("rejects unknown versions and writes, while keeping account routes protected", async () => {
    for (const path of [
      `${PLUGIN_API_PATH}/2.0`,
      `${PLUGIN_API_PATH}/2.0/schema.json`,
      `${PLUGIN_API_PATH}/1.0/not-found`,
    ]) {
      const response = await request(path);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: "not_found",
        supportedVersions: [PLUGIN_PROTOCOL_VERSION],
      });
    }
    for (const path of [
      PLUGIN_API_PATH,
      PLUGIN_SCHEMA_PATH,
      PLUGIN_MARKDOWN_PATH,
      "/llms.txt",
      LLMS_FULL_PATH,
    ]) {
      const response = await request(path, { method: "POST" });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    }
    expect((await request("/api/me")).status).toBe(401);
    expect((await request("/api/dashboard")).status).toBe(401);
    expect(
      (
        await request("/api/channels", {
          method: "POST",
          headers: { origin: "https://agent.example" },
        })
      ).status,
    ).toBe(403);
  });
});

describe("agent-readable JSON Schema", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(protocolJsonSchema);
  const validate = (name: string, value: unknown) =>
    ajv.validate({ $ref: `${protocolLinks.schema}#/$defs/${name}` }, value);

  it("publishes executable schemas and examples for each contract", async () => {
    const response = await request(PLUGIN_SCHEMA_PATH, undefined, {} as Env);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/schema+json; charset=utf-8");
    expect(await response.json()).toEqual(protocolJsonSchema);
    for (const [name, example] of Object.entries(protocolExamples)) {
      expect(
        validate(name[0].toUpperCase() + name.slice(1), example),
        JSON.stringify(ajv.errors),
      ).toBe(true);
    }
    expect(validate("Block", { type: "text", text: "你好" })).toBe(true);
  });

  it("rejects spoofed usage, unknown versions, extra fields and invalid limits", () => {
    for (const addition of [
      { usage: {} },
      { credits: 0 },
      { imageCount: 3 },
      { protocolVersion: "9.0" },
    ]) {
      const result = { ...protocolExamples.result, ...addition };
      expect(validate("Result", result)).toBe(false);
      expect(pluginResultSchema.safeParse(result).success).toBe(false);
    }
    for (const creditUnits of [-1, 0.1, 1000000001]) {
      expect(
        validate("Invocation", {
          ...protocolExamples.invocation,
          limits: { ...protocolExamples.invocation.limits, creditUnits },
        }),
      ).toBe(false);
    }
    for (const creditUnits of [null, 0]) {
      expect(
        validate("Invocation", {
          ...protocolExamples.invocation,
          limits: { ...protocolExamples.invocation.limits, creditUnits },
        }),
      ).toBe(true);
    }
    expect(validate("Block", { type: "image", url: "https://example.com/forged.png" })).toBe(false);
  });

  it("keeps every published JSON example consistent with the execution schemas", () => {
    const examples = [...protocolMarkdown.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) =>
      JSON.parse(match[1]),
    );
    for (const example of [
      protocolExamples.manifest,
      protocolExamples.invocation,
      protocolExamples.result,
    ]) {
      expect(examples).toContainEqual(example);
    }
    expect(protocolMarkdown).toContain(protocolLinks.schema);
  });
});
