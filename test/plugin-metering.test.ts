import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { countTextTokens, limitTextTokens } from "../src/server/tokenizer";
import { invokePlugin } from "../src/server/plugins/gateway";
import { invokeLlmChat } from "../src/server/plugins/llm-chat";
import { assistantSchema } from "../src/server/llm";
import {
  pluginManifestSchema,
  PLUGIN_PROTOCOL_VERSION,
  TOKENIZER_VERSION,
  type PluginInvocation,
} from "../src/shared/plugins";

const invocation = (overrides: Partial<PluginInvocation> = {}): PluginInvocation => ({
  protocolVersion: PLUGIN_PROTOCOL_VERSION,
  runId: "run-1",
  instanceId: "mine",
  pluginId: "test/echo",
  pluginVersion: "1.0.0",
  sessionId: "session-1",
  messages: [{ role: "user", content: [{ type: "text", text: "你好" }] }],
  limits: { inputTokens: 1000, outputTokens: 1000, outputImages: 5, creditUnits: null },
  ...overrides,
});
const result = (content: unknown = [{ type: "text", text: "已回复" }]) => ({
  protocolVersion: PLUGIN_PROTOCOL_VERSION,
  runId: "run-1",
  status: "completed",
  content,
});
afterEach(() => vi.unstubAllGlobals());

describe("platform tokenizer and plugin boundary", () => {
  it("pins public golden counts, treats special-looking input as ordinary text, and counts empty text as zero", () => {
    expect(countTextTokens("")).toBe(0);
    expect(countTextTokens("Hello, world!")).toBe(4);
    expect(countTextTokens("你好")).toBe(2);
    expect(countTextTokens("<|endoftext|>")).toBe(7);
    expect(TOKENIZER_VERSION).toBe("cl100k_base@gpt-tokenizer-4.0.0");
  });
  it("clips Chinese and emoji without splitting Unicode or exceeding the token limit", () => {
    const text = "你好👨‍👩‍👧‍👦，世界🌍！";
    for (let limit = 0; limit < countTextTokens(text); limit++) {
      const clipped = limitTextTokens(text, limit);
      expect(text.startsWith(clipped)).toBe(true);
      expect(countTextTokens(clipped)).toBeLessThanOrEqual(limit);
      expect(clipped).not.toContain("�");
    }
  });
  it("meters actual gateway content, independent of adapter mutation or its private work", async () => {
    const outcome = await invokePlugin(invocation(), async (request) => {
      request.messages = [];
      request.limits.creditUnits = 0;
      return result();
    });
    expect(outcome.meter).toMatchObject({
      inputTokens: 2,
      outputTokens: 3,
      outputImages: 0,
      units: 6,
    });
    expect(outcome.meter.policyVersion).toBe("gateway-v1");
  });
  it("merges output fragments before counting and ignores identifiers in input", async () => {
    const first = await invokePlugin(invocation(), async () =>
      result([{ type: "text", text: "Hello, world!" }]),
    );
    const second = await invokePlugin(
      invocation({ sessionId: "private-and-very-long-identifier" }),
      async () =>
        result([
          { type: "text", text: "Hel" },
          { type: "text", text: "lo, world!" },
        ]),
    );
    expect(second.meter).toEqual(first.meter);
    expect(second.result.content).toEqual(first.result.content);
  });
  it("rejects incompatible versions, spoofed run IDs and self-reported billing fields", async () => {
    const execute = vi.fn(async () => result());
    await expect(
      invokePlugin({ ...invocation(), protocolVersion: "9" } as never, execute),
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
    await expect(
      invokePlugin(invocation(), async () => ({ ...result(), runId: "other" })),
    ).rejects.toThrow("标识");
    await expect(
      invokePlugin(invocation(), async () => ({ ...result(), usage: { input_tokens: 0 } })),
    ).rejects.toThrow();
    expect(pluginManifestSchema.safeParse({ id: "bad" }).success).toBe(false);
  });
  it("rejects input above a token or credits limit before invoking any plugin", async () => {
    const execute = vi.fn(async () => result());
    for (const limits of [
      { ...invocation().limits, inputTokens: 1 },
      { ...invocation().limits, creditUnits: 0 },
    ]) {
      await expect(invokePlugin(invocation({ limits }), execute)).rejects.toThrow();
    }
    expect(execute).not.toHaveBeenCalled();
  });
  it("enforces output limits itself when an adapter ignores them", async () => {
    const outcome = await invokePlugin(
      invocation({ limits: { ...invocation().limits, outputTokens: 3, creditUnits: 5 } }),
      async () => result([{ type: "text", text: "Hello, world! Some extra words." }]),
    );
    expect(outcome.truncated).toBe(true);
    expect(outcome.meter.outputTokens).toBeLessThanOrEqual(2);
    expect(outcome.meter.units).toBeLessThanOrEqual(5);
  });
  it("charges only platform-verified result images once, never input references or repeat deliveries", async () => {
    const request = invocation({
      messages: [
        {
          role: "user",
          content: [
            { type: "image", assetId: "input-photo" },
            { type: "text", text: "你好" },
          ],
        },
      ],
    });
    const output = result([
      { type: "image", assetId: "a" },
      { type: "image", assetId: "b" },
      { type: "image", assetId: "a" },
    ]);
    await expect(invokePlugin(request, async () => output)).rejects.toThrow("校验");
    await expect(
      invokePlugin(
        request,
        async () => output,
        async (id) => ({ assetId: id, runId: "another-account-run", kind: "image", ready: true }),
      ),
    ).rejects.toThrow("校验");
    const accepted = await invokePlugin(
      request,
      async () => output,
      async (id, runId) => ({ assetId: id, runId, kind: "image", ready: true }),
    );
    expect(accepted.meter).toMatchObject({
      inputTokens: 2,
      outputTokens: 0,
      outputImages: 2,
      units: 10001,
    });
    expect(accepted.result.content).toHaveLength(2);
  });
  it.each(["chat-completions", "responses", "anthropic"] as const)(
    "ignores absent, zero and inflated %s provider usage",
    async (protocol) => {
      const model = {
        ...assistantSchema.parse({
          name: "Model",
          protocol,
          model: "example",
          baseUrl: "https://llm.example.com",
          systemPrompt: "",
        }),
        id: "model-1",
        channelId: "channel",
        channelName: "Channel",
        createdAt: 0,
        hasKey: true,
      };
      const outcomes = [];
      for (const usage of [
        undefined,
        { input_tokens: 0, output_tokens: 0, prompt_tokens: 0, completion_tokens: 0 },
        {
          input_tokens: 100000000,
          output_tokens: 100000000,
          prompt_tokens: 100000000,
          completion_tokens: 100000000,
        },
        { input_tokens: -1, output_tokens: "fake", prompt_tokens: "fake", completion_tokens: -1 },
      ]) {
        vi.stubGlobal(
          "fetch",
          vi.fn(async (url) =>
            String(url).includes("cloudflare-dns.com")
              ? Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] })
              : Response.json({
                  choices: [
                    {
                      message: {
                        content: "已回复",
                        reasoning_content: "secret internal reasoning",
                      },
                    },
                  ],
                  output: [
                    { type: "reasoning", summary: [] },
                    { type: "message", content: [{ type: "output_text", text: "已回复" }] },
                  ],
                  content: [
                    { type: "thinking", thinking: "internal" },
                    { type: "text", text: "已回复" },
                  ],
                  usage,
                }),
          ),
        );
        outcomes.push(
          await invokeLlmChat(
            env,
            model,
            "test-only-key",
            [{ role: "user", content: "你好" }],
            64,
            10000,
            "run-1",
            null,
            null,
          ),
        );
      }
      for (const outcome of outcomes)
        expect(outcome).toMatchObject({
          text: "已回复",
          inputTokens: 2,
          outputTokens: 3,
          units: 6,
          estimated: false,
        });
    },
  );
});
