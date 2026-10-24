import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { modelProtocolIssue, isChatModel } from "../src/shared/model-compatibility";
import { assistantSchema, callModel } from "../src/server/llm";
import { callModelWithTools } from "../src/server/llm-tools";
import type { Assistant } from "../src/shared/types";

const audio: Assistant = {
  ...assistantSchema.parse({
    name: "Audio",
    model: "gpt-audio-1.5",
    baseUrl: "https://api.openai.com/v1",
    protocol: "responses",
  }),
  id: "audio",
  channelId: "openai",
  channelName: "OpenAI",
  createdAt: 1,
  hasKey: true,
};
afterEach(() => vi.unstubAllGlobals());

describe("model protocol compatibility", () => {
  it.each([
    "o3-pro",
    "o3-pro-2025-06-10",
    "o1-pro",
    "o1-pro-2025-03-19",
    "o3-deep-research",
    "o4-mini-deep-research-2025-06-26",
    "computer-use-preview",
    "gpt-5-pro",
    "gpt-5-pro-2025-10-06",
    "gpt-5.5-pro-2026-04-23",
    "gpt-5-codex",
    "gpt-5.1-codex-max",
    "gpt-daybreak-blue-latest",
    "gpt-5.6-cyber",
    "gpt-rosalind-research",
  ])("keeps documented Responses-only model %s on Responses", (model) => {
    expect(isChatModel({ ...audio, model, protocol: "responses" })).toBe(true);
    for (const protocol of ["chat-completions", "anthropic"] as const) {
      expect(isChatModel({ ...audio, model, protocol, kind: "text" })).toBe(false);
      expect(modelProtocolIssue({ ...audio, model, protocol })).toContain(
        "仅支持 OpenAI Responses",
      );
    }
  });
  it.each([
    "gpt-audio",
    "gpt-audio-1.5",
    "gpt-audio-mini",
    "gpt-audio-2025-08-28",
    "gpt-4o-audio-preview",
    "gpt-4o-mini-audio-preview-2024-12-17",
  ])("%s remains a text-capable model only on a compatible official protocol", (model) => {
    expect(modelProtocolIssue({ ...audio, model })).toContain("Chat Completions");
    expect(isChatModel({ ...audio, model, kind: "text" })).toBe(false);
    expect(modelProtocolIssue({ ...audio, model, protocol: "anthropic" })).toContain(
      "Chat Completions",
    );
    expect(isChatModel({ ...audio, model, protocol: "chat-completions" })).toBe(true);
  });

  it("does not impose the official protocol restriction on other gateways or unrelated models", () => {
    for (const baseUrl of [
      "https://proxy.example.com/v1",
      "https://api.openai.com.example.com/v1",
      "https://openrouter.ai/api/v1",
    ]) {
      expect(isChatModel({ ...audio, baseUrl })).toBe(true);
      expect(
        isChatModel({ ...audio, baseUrl, model: "o3-pro", protocol: "chat-completions" }),
      ).toBe(true);
    }
    for (const model of ["gpt-4.1-mini", "o3", "custom-pro", "custom-codex", "o3-pro-custom"])
      expect(isChatModel({ ...audio, model, protocol: "chat-completions" })).toBe(true);
    expect(isChatModel({ ...audio, model: "gpt-4.1-mini" })).toBe(true);
    expect(isChatModel({ ...audio, model: "gpt-audiovisual-custom" })).toBe(true);
    expect(isChatModel({ ...audio, model: "grok-imagine-image" })).toBe(false);
    expect(
      modelProtocolIssue({ ...audio, baseUrl: "https://API.OPENAI.COM./v1/responses/" }),
    ).toBeTruthy();
    expect(modelProtocolIssue({ ...audio, baseUrl: "invalid" })).toBeUndefined();
  });

  it.each([
    { model: "gpt-audio-1.5", protocol: "responses" as const },
    { model: "o3-pro", protocol: "chat-completions" as const },
  ])(
    "rejects incompatible $model ordinary and tool requests before DNS or inference",
    async (connection) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const messages = [{ role: "user" as const, content: "hello" }];
      const assistant = { ...audio, ...connection };
      await expect(callModel(env, assistant, "test-key", messages)).rejects.toMatchObject({
        code: "model_protocol",
        status: 422,
      });
      await expect(
        callModelWithTools(env, assistant, "test-key", messages, [], [], 8192, 30000),
      ).rejects.toMatchObject({ code: "model_protocol", status: 422 });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
