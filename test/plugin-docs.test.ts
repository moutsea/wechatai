import { createExecutionContext, env } from "cloudflare:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import worker from "../src/server/index";
import { protocolIndex, protocolJsonSchema } from "../src/server/plugin-docs";
import {
  PLUGIN_API_PATH,
  PLUGIN_MARKDOWN_PATH,
  PLUGIN_SCHEMA_PATH,
  PLUGIN_VERSION_PATH,
  protocolExamples,
  protocolLinks,
  protocolMarkdown,
  protocolSections,
} from "../src/shared/plugin-docs";
import { PLUGIN_PROTOCOL_VERSION, pluginResultSchema } from "../src/shared/plugins";

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

  it("supports HEAD, CORS preflight and conditional reads", async () => {
    for (const path of [PLUGIN_API_PATH, PLUGIN_MARKDOWN_PATH, PLUGIN_SCHEMA_PATH, "/llms.txt"]) {
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
    for (const path of [PLUGIN_API_PATH, PLUGIN_SCHEMA_PATH, PLUGIN_MARKDOWN_PATH, "/llms.txt"]) {
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
