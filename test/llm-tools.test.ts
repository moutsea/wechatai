import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantSchema, estimateTokens } from "../src/server/llm";
import {
  buildToolRequest,
  callModelWithTools,
  fitToolRequest,
  parseToolReply,
  type ModelTool,
  type ModelToolRound,
} from "../src/server/llm-tools";
import { modelInputBudget } from "../src/shared/context";
import { countTextTokens } from "../src/server/tokenizer";
import type { Assistant } from "../src/shared/types";

const model: Assistant = {
  ...assistantSchema.parse({
    name: "Test",
    model: "test",
    protocol: "responses",
    baseUrl: "https://llm.example.com",
    maxInputTokens: 2500,
  }),
  id: "model",
  channelId: "channel",
  channelName: "Test",
  createdAt: 0,
  hasKey: true,
};
const tools: ModelTool[] = [
  {
    name: "web_search",
    description: "Search",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
];
const call = {
  type: "function_call",
  call_id: "call_1",
  name: "web_search",
  arguments: '{"query":"test"}',
};
afterEach(() => vi.unstubAllGlobals());
describe("tool model endpoint validation", () => {
  it.each(["chat-completions", "responses", "anthropic"] as const)(
    "allows the configured local KimiSeek endpoint for %s, without allowing other private URLs",
    async (protocol) => {
      const local: Env = { ...env, KIMISEEK_API_URL: "http://localhost:3000" };
      const localModel: Assistant = { ...model, protocol, baseUrl: local.KIMISEEK_API_URL };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json(
            protocol === "chat-completions"
              ? { choices: [{ message: { content: "Hello" } }] }
              : protocol === "anthropic"
                ? { content: [{ type: "text", text: "Hello" }] }
                : {
                    status: "completed",
                    output: [
                      { type: "message", content: [{ type: "output_text", text: "Hello" }] },
                    ],
                  },
          ),
        ),
      );
      const invoke = (target = localModel, settings = local) =>
        callModelWithTools(
          settings,
          target,
          "test-only-key",
          [{ role: "user", content: "Hi" }],
          tools,
          [],
          128,
          1000,
        );
      await expect(invoke()).resolves.toMatchObject({ text: "Hello" });
      expect(fetch).toHaveBeenCalledTimes(1);
      for (const baseUrl of [
        "http://localhost:3001",
        "http://localhost:3000/private",
        "http://127.0.0.1:3000",
        "https://127.0.0.1",
      ])
        await expect(invoke({ ...localModel, baseUrl })).rejects.toMatchObject({
          code: "unsafe_url",
        });
      await expect(
        invoke(localModel, { ...local, APP_URL: "https://wechatai.app" }),
      ).rejects.toMatchObject({ code: "unsafe_url" });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
});
describe("native tool protocol boundaries", () => {
  it("preserves Responses encrypted reasoning and call IDs in stateless continuation", () => {
    const reasoning = {
      id: "rs_1",
      type: "reasoning",
      summary: [{ type: "summary_text", text: "private" }],
      encrypted_content: "opaque-encrypted-state",
    };
    const parsed = parseToolReply("responses", { status: "completed", output: [reasoning, call] });
    const body = buildToolRequest(
      model,
      [{ role: "user", content: "Question" }],
      tools,
      [{ continuation: parsed.continuation, results: [{ id: "call_1", content: "Found" }] }],
      1024,
    );
    expect(body).toMatchObject({
      store: false,
      include: ["reasoning.encrypted_content"],
      tool_choice: "auto",
      tools: [{ type: "function", name: "web_search" }],
      input: [
        { role: "user", content: "Question" },
        reasoning,
        call,
        { type: "function_call_output", call_id: "call_1", output: "Found" },
      ],
    });
    expect(parsed.text).toBe("");
  });
  it("preserves signed and redacted thinking and puts every Anthropic tool result first", () => {
    const thinking = { type: "thinking", thinking: "private", signature: "unchanged-signature" };
    const redacted = { type: "redacted_thinking", data: "opaque-redacted" };
    const use = { type: "tool_use", id: "use_1", name: "web_search", input: { query: "test" } };
    const parsed = parseToolReply("anthropic", {
      stop_reason: "tool_use",
      content: [thinking, redacted, use],
    });
    const body = buildToolRequest(
      { ...model, protocol: "anthropic" },
      [{ role: "user", content: "Question" }],
      tools,
      [
        {
          continuation: parsed.continuation,
          results: [{ id: "use_1", content: "Failure", error: true }],
        },
      ],
      1024,
      false,
    );
    expect(body).toMatchObject({
      tool_choice: { type: "none" },
      tools: [{ name: "web_search", input_schema: tools[0].parameters }],
      messages: [
        { role: "user" },
        { role: "assistant", content: [thinking, redacted, use] },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "use_1", content: "Failure", is_error: true },
          ],
        },
      ],
    });
    expect(parsed.text).toBe("");
  });
  it.each([
    [
      "chat-completions",
      {
        choices: [
          {
            finish_reason: "length",
            message: {
              tool_calls: [
                { id: "a", type: "function", function: { name: "web_search", arguments: "{}" } },
              ],
            },
          },
        ],
      },
    ],
    ["responses", { status: "incomplete", output: [call] }],
    [
      "anthropic",
      {
        stop_reason: "max_tokens",
        content: [{ type: "tool_use", id: "a", name: "web_search", input: {} }],
      },
    ],
  ] as const)("rejects truncated %s calls before any tool can execute", (protocol, raw) => {
    expect(() => parseToolReply(protocol, raw)).toThrow("被截断");
  });
  it("rejects duplicate, missing and oversized call batches", () => {
    for (const output of [
      [call, call],
      [{ ...call, call_id: null }],
      Array.from({ length: 9 }, (_, n) => ({ ...call, call_id: `c${n}` })),
    ])
      expect(() => parseToolReply("responses", { output })).toThrow("工具调用无效或过多");
  });
  it("does not interpret malformed JSON arguments as executable parameters", () => {
    const reply = parseToolReply("responses", { output: [{ ...call, arguments: '{"query":' }] });
    expect(reply.calls[0].arguments).toBeUndefined();
    expect(reply.continuation[0].arguments).toBe('{"query":');
  });
  it("shrinks only tool text to fit the whole request without losing arguments or signed state", () => {
    const reasoning = {
      type: "reasoning",
      id: "rs_1",
      summary: [],
      encrypted_content: "opaque-signed-state",
    };
    const rounds: ModelToolRound[] = [
      {
        continuation: [reasoning, call],
        results: [{ id: "call_1", content: "搜索结果 ".repeat(20000) }],
      },
    ];
    const body = fitToolRequest(
      model,
      [{ role: "user", content: "用户问题必须保留" }],
      tools,
      rounds,
      1024,
    );
    const encoded = JSON.stringify(body);
    expect(Math.max(countTextTokens(encoded), estimateTokens(encoded))).toBeLessThanOrEqual(
      modelInputBudget(model, 1024),
    );
    expect(encoded).toContain("用户问题必须保留");
    expect(encoded).toContain("opaque-signed-state");
    expect(encoded).toContain("工具资料已截断");
    expect(rounds[0].results[0].content.length).toBeGreaterThan(10000);
  });
  it("refuses to silently truncate the user message or oversized reasoning state", () => {
    expect(() =>
      fitToolRequest(
        model,
        [{ role: "user", content: "用户长消息 ".repeat(10000) }],
        tools,
        [],
        1024,
      ),
    ).toThrow("输入空间");
    const rounds: ModelToolRound[] = [
      {
        continuation: [{ type: "reasoning", encrypted_content: "opaque ".repeat(10000) }, call],
        results: [{ id: "call_1", content: "short" }],
      },
    ];
    expect(() =>
      fitToolRequest(model, [{ role: "user", content: "Question" }], tools, rounds, 1024),
    ).toThrow("输入空间");
  });
});
