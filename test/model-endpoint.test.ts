import { describe, expect, it } from "vitest";
import { apiEndpoint, modelEndpoint, modelsEndpoint } from "../src/shared/model-endpoint";

describe("provider API versions", () => {
  it.each(["https://open.bigmodel.cn/api/coding/paas/v4", "https://open.bigmodel.cn/api/paas/v4"])(
    "preserves the Zhipu API root %s",
    (base) => {
      for (const suffix of ["", "/", "/chat/completions", "/chat/completions/"]) {
        expect(modelEndpoint(`${base}${suffix}`, "chat-completions")).toBe(
          `${base}/chat/completions`,
        );
      }
    },
  );

  it.each([
    { protocol: "chat-completions", resource: "/chat/completions" },
    { protocol: "responses", resource: "/responses" },
    { protocol: "anthropic", resource: "/messages" },
  ] as const)("preserves explicit versions when selecting $protocol", ({ protocol, resource }) => {
    for (const version of ["v1", "v3", "v4", "v1beta", "v1beta1"]) {
      const base = `https://api.example.com/gateway/${version}`;
      for (const suffix of ["", "/", "/chat/completions", "/responses", "/messages"])
        expect(modelEndpoint(`${base}${suffix}`, protocol)).toBe(`${base}${resource}`);
    }
  });

  it("uses the same version for model catalogs and image generation", () => {
    const base = "https://api.example.com/gateway/v4";
    for (const suffix of ["", "/", "/models", "/chat/completions", "/images/generations/"]) {
      expect(modelsEndpoint(`${base}${suffix}`)).toBe(`${base}/models`);
      expect(apiEndpoint(`${base}${suffix}`, "/v1/images/generations")).toBe(
        `${base}/images/generations`,
      );
    }
  });

  it("keeps the default v1 for unversioned roots and gateway prefixes", () => {
    for (const prefix of ["", "/gateway", "/api/anthropic", "/gateway/v4/compatible"]) {
      const base = `https://api.example.com${prefix}`;
      expect(modelEndpoint(base, "chat-completions")).toBe(`${base}/v1/chat/completions`);
      expect(modelsEndpoint(base)).toBe(`${base}/v1/models`);
    }
  });

  it.each([
    "https://generativelanguage.googleapis.com/v1beta/openai",
    "https://gateway.ai.cloudflare.com/v1/account/gateway/openai",
  ])("does not insert v1 into the documented compatible root %s", (base) => {
    for (const suffix of ["", "/", "/chat/completions", "/chat/completions/"]) {
      expect(modelEndpoint(`${base}${suffix}`, "chat-completions")).toBe(
        `${base}/chat/completions`,
      );
      expect(modelsEndpoint(`${base}${suffix}`)).toBe(`${base}/models`);
      expect(apiEndpoint(`${base}${suffix}`, "/v1/images/generations")).toBe(
        `${base}/images/generations`,
      );
    }
  });

  it("keeps Responses on the same Cloudflare OpenAI gateway", () => {
    const base = "https://gateway.ai.cloudflare.com/v1/account/gateway/openai";
    for (const suffix of ["", "/", "/chat/completions", "/responses/"])
      expect(modelEndpoint(`${base}${suffix}`, "responses")).toBe(`${base}/responses`);
  });

  it.each([
    "https://api.example.com",
    "https://api.example.com/custom/gateway",
    "https://api.example.com/v3/bots",
  ])("preserves an explicit endpoint even on an unknown provider %s", (base) => {
    for (const resource of [
      "/chat/completions",
      "/responses",
      "/messages",
      "/models",
      "/images/generations",
    ]) {
      for (const trailing of ["", "/"]) {
        const endpoint = `${base}${resource}${trailing}`;
        expect(modelEndpoint(endpoint, "chat-completions")).toBe(`${base}/chat/completions`);
        expect(modelEndpoint(endpoint, "responses")).toBe(`${base}/responses`);
        expect(modelEndpoint(endpoint, "anthropic")).toBe(`${base}/messages`);
        expect(modelsEndpoint(endpoint)).toBe(`${base}/models`);
        expect(apiEndpoint(endpoint, "/v1/images/generations")).toBe(`${base}/images/generations`);
      }
    }
  });

  it.each([
    "https://gateway.ai.cloudflare.com/v1/account/gateway/anthropic",
    "https://dashscope.aliyuncs.com/apps/anthropic",
    "https://open.bigmodel.cn/api/anthropic",
  ])("still appends v1/messages to Anthropic's SDK root %s", (base) => {
    expect(modelEndpoint(base, "anthropic")).toBe(`${base}/v1/messages`);
    expect(modelEndpoint(`${base}/v1/messages`, "anthropic")).toBe(`${base}/v1/messages`);
  });

  it.each([
    "https://generativelanguage.googleapis.com.example.com/v1beta/openai",
    "https://gateway.ai.cloudflare.com.example.com/v1/account/gateway/openai",
    "https://api.example.com/openai",
    "https://generativelanguage.googleapis.com/custom/openai",
    "https://gateway.ai.cloudflare.com/v1/account/gateway/custom/openai",
  ])("does not apply provider-specific rules to unrelated roots %s", (base) => {
    expect(modelEndpoint(base, "chat-completions")).toBe(`${base}/v1/chat/completions`);
  });
});
