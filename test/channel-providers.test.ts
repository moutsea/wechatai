import { describe, expect, it } from "vitest";
import {
  CHANNEL_PROVIDERS,
  channelProvider,
  detectChannelProvider,
  selectChannelProvider,
  channelNeedsApiKey,
} from "../src/shared/channel-providers";
import { modelEndpoint } from "../src/shared/model-endpoint";
import type { ChannelInput } from "../src/shared/types";

const form: ChannelInput = {
  name: "DeepSeek",
  description: "工作",
  protocol: "chat-completions",
  baseUrl: "https://api.deepseek.com",
  apiKey: "test-key",
  color: "sage",
};

describe("provider connection presets", () => {
  it.each([
    ["deepseek", "https://api.deepseek.com/v1/chat/completions"],
    ["kimi", "https://api.moonshot.cn/v1/chat/completions"],
    ["zhipu", "https://open.bigmodel.cn/api/paas/v4/chat/completions"],
    ["zhipu-coding", "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions"],
    ["qwen", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"],
    ["qwen-coding", "https://coding.dashscope.aliyuncs.com/v1/chat/completions"],
    ["volcengine", "https://ark.cn-beijing.volces.com/api/v3/chat/completions"],
    ["volcengine-coding", "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions"],
    ["minimax", "https://api.minimax.cn/v1/chat/completions"],
    ["siliconflow", "https://api.siliconflow.cn/v1/chat/completions"],
    ["openai", "https://api.openai.com/v1/responses"],
    ["anthropic", "https://api.anthropic.com/v1/messages"],
    ["gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"],
    ["openrouter", "https://openrouter.ai/api/v1/chat/completions"],
    ["xai", "https://api.x.ai/v1/responses"],
  ])("%s produces its documented endpoint", (id, expected) => {
    const provider = channelProvider(id)!;
    expect(modelEndpoint(provider.baseUrl, provider.protocol)).toBe(expected);
    expect(detectChannelProvider(provider)).toBe(id);
  });

  it("does not infer a preset from a familiar domain with a different route or protocol", () => {
    expect(detectChannelProvider({ ...form, baseUrl: "https://api.deepseek.com/private/v1" })).toBe(
      "custom",
    );
    expect(detectChannelProvider({ ...form, protocol: "responses" })).toBe("custom");
    expect(
      detectChannelProvider({ ...form, baseUrl: "https://api.deepseek.com.attacker.test" }),
    ).toBe("custom");
    expect(detectChannelProvider({ ...form, baseUrl: "not-a-url" })).toBe("custom");
    expect(new Set(CHANNEL_PROVIDERS.map((p) => p.id)).size).toBe(CHANNEL_PROVIDERS.length);
  });

  it("recognizes existing equivalent full URLs without rewriting them", () => {
    const existing = { ...form, baseUrl: "https://api.deepseek.com/v1/chat/completions/" };
    expect(detectChannelProvider(existing)).toBe("deepseek");
    expect(existing.baseUrl).toBe("https://api.deepseek.com/v1/chat/completions/");
    expect(channelNeedsApiKey(form, existing)).toBe(false);
    expect(channelNeedsApiKey(undefined, existing)).toBe(true);
  });

  it("fills the name and route while dropping a different provider's draft key", () => {
    const changed = selectChannelProvider(form, "zhipu-coding");
    expect(changed).toMatchObject({
      name: "智谱 Coding Plan",
      description: "工作",
      apiKey: "",
      baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    });
    expect(channelNeedsApiKey(form, changed)).toBe(true);
    expect(form.apiKey).toBe("test-key");
  });

  it("requires new credentials even when switching plans on the same hostname", () => {
    const standard = { ...selectChannelProvider(form, "zhipu"), apiKey: "standard-key" };
    const coding = selectChannelProvider(standard, "zhipu-coding");
    expect(coding.apiKey).toBe("");
    expect(channelNeedsApiKey(standard, coding)).toBe(true);
  });

  it("reuses credentials when only the protocol or resource suffix changes", () => {
    const original = { ...form, baseUrl: "https://api.openai.com/v1/chat/completions" };
    for (const protocol of ["responses", "anthropic"] as const) {
      expect(channelNeedsApiKey(original, { ...original, protocol })).toBe(false);
    }
    expect(
      channelNeedsApiKey(original, {
        ...original,
        baseUrl: "https://api.openai.com/v1/responses",
        protocol: "responses",
      }),
    ).toBe(false);
    expect(selectChannelProvider(original, "openai").apiKey).toBe("test-key");
    expect(
      channelNeedsApiKey(form, {
        ...form,
        baseUrl: "https://api.deepseek.com/v1/",
        protocol: "responses",
      }),
    ).toBe(false);
  });

  it("keeps gateway, plan and origin boundaries even when switching protocols", () => {
    const original = { ...form, baseUrl: "https://api.example.com/gateway-a/v1/chat/completions" };
    for (const baseUrl of [
      "https://api.example.com/gateway-b/v1/responses",
      "https://other.example.com/gateway-a/v1/responses",
      "http://api.example.com/gateway-a/v1/responses",
      "https://api.example.com:8443/gateway-a/v1/responses",
      "https://api.example.com/gateway-a/v1/responses?key=secret",
      "https://user:secret@api.example.com/gateway-a/v1/responses",
    ])
      expect(channelNeedsApiKey(original, { ...original, baseUrl, protocol: "responses" })).toBe(
        true,
      );
    const standard = selectChannelProvider(form, "volcengine");
    expect(channelNeedsApiKey(standard, selectChannelProvider(standard, "volcengine-coding"))).toBe(
      true,
    );
  });

  it("preserves custom names and allows customizing a preset without changing any config", () => {
    expect(selectChannelProvider({ ...form, name: "我的工作渠道" }, "gemini").name).toBe(
      "我的工作渠道",
    );
    expect(selectChannelProvider(form, "custom")).toEqual(form);
    expect(selectChannelProvider(form, "deepseek").apiKey).toBe("test-key");
    expect(channelNeedsApiKey(form, { ...form, baseUrl: "" })).toBe(true);
  });
});
