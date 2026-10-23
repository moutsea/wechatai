import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantSchema, estimateTokens } from "../src/server/llm";
import {
  buildToolRequest,
  callModelWithTools,
  fitToolRequest,
  parseToolReply,
  ToolReplyValidationError,
  type ModelTool,
  type ModelToolRound,
  type ToolReplyRetryState,
} from "../src/server/llm-tools";
import { modelInputBudget } from "../src/shared/context";
import { countTextTokens } from "../src/server/tokenizer";
import type { Assistant, Protocol } from "../src/shared/types";

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
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
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
  it.each([
    ["missing_call_id", { ...call, call_id: null }],
    ["missing_call_id", { ...call, call_id: "" }],
    ["invalid_call_id", { ...call, call_id: 12 }],
    ["invalid_call_id", { ...call, call_id: "x".repeat(201) }],
    ["invalid_call_id", { ...call, call_id: "   " }],
    ["missing_tool_name", { ...call, name: undefined }],
    ["invalid_tool_name", { ...call, name: [] }],
    ["invalid_tool_name", { ...call, name: "x".repeat(101) }],
  ])("identifies %s without retaining the upstream payload", (issue, invalid) => {
    try {
      parseToolReply("responses", { output: [invalid] });
      expect.fail("Expected validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolReplyValidationError);
      expect(error).toMatchObject({ issue, callCount: 1, callIndex: 0, truncated: false });
      expect(JSON.stringify(error)).not.toContain("web_search");
      expect(JSON.stringify(error)).not.toContain("query");
    }
  });
  it("distinguishes duplicate IDs, reused IDs, excessive batches and unsupported types", () => {
    const check = (parse: () => unknown, issue: string) => {
      try {
        parse();
        expect.fail("Expected validation failure");
      } catch (error) {
        expect(error).toMatchObject({ code: "tool_call_invalid", issue });
      }
    };
    check(() => parseToolReply("responses", { output: [call, call] }), "duplicate_call_id");
    check(
      () => parseToolReply("responses", { output: [call] }, new Set([call.call_id])),
      "reused_call_id",
    );
    check(
      () => parseToolReply("responses", { output: Array.from({ length: 9 }, () => call) }),
      "too_many_calls",
    );
    check(
      () => parseToolReply("chat-completions", { choices: [{ message: { tool_calls: [{}] } }] }),
      "unsupported_tool_type",
    );
    check(
      () => parseToolReply("chat-completions", { choices: [{ message: { tool_calls: {} } }] }),
      "invalid_call_list",
    );
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

describe("safe tool reply correction", () => {
  const local: Env = { ...env, KIMISEEK_API_URL: "http://localhost:3000" };
  const payload = (protocol: Protocol, id = "") => {
    if (protocol === "responses") return { output: [{ ...call, call_id: id }] };
    if (protocol === "anthropic")
      return { content: [{ type: "tool_use", id, name: call.name, input: { query: "test" } }] };
    return {
      choices: [
        {
          message: {
            tool_calls: [
              {
                id,
                type: "function",
                function: { name: call.name, arguments: call.arguments },
              },
            ],
          },
        },
      ],
    };
  };
  const invoke = (
    protocol: Protocol,
    state: ToolReplyRetryState = { used: false },
    checkpoint = async () => {},
    rounds: ModelToolRound[] = [],
    timeoutMs = 10000,
  ) =>
    callModelWithTools(
      local,
      { ...model, protocol, baseUrl: local.KIMISEEK_API_URL },
      "private-api-key",
      [{ role: "user", content: "private-user-prompt" }],
      tools,
      rounds,
      128,
      timeoutMs,
      true,
      4000,
      { state, checkpoint },
    );

  it.each(["chat-completions", "responses", "anthropic"] as const)(
    "corrects a rejected %s batch once without sending its content back or altering valid history",
    async (protocol) => {
      const accepted = parseToolReply(protocol, payload(protocol, "previous"));
      const rounds = [
        {
          continuation: accepted.continuation,
          results: [{ id: "previous", content: "Already done" }],
        },
      ];
      const before = structuredClone(rounds);
      const invalid = JSON.parse(
        JSON.stringify(payload(protocol)).replaceAll("test", "private-invalid-arguments"),
      );
      const bodies: unknown[] = [];
      const log = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url, init) => {
          bodies.push(JSON.parse(String(init?.body)));
          return Response.json(bodies.length === 1 ? invalid : payload(protocol, "fixed"));
        }),
      );
      const state = { used: false };
      const checkpoint = vi.fn(async () => {
        expect(state.used).toBe(true);
      });
      await expect(invoke(protocol, state, checkpoint, rounds)).resolves.toMatchObject({
        calls: [{ id: "fixed" }],
      });
      expect(bodies).toHaveLength(2);
      expect(checkpoint).toHaveBeenCalledOnce();
      expect(JSON.stringify(bodies[1])).toContain("上一批工具调用因格式校验失败");
      expect(JSON.stringify(bodies[1])).toContain("Already done");
      expect(JSON.stringify(bodies[1])).not.toContain("private-invalid-arguments");
      expect(rounds).toEqual(before);
      expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
        event: "llm.tool_reply_rejected",
        protocol,
        issue: "missing_call_id",
        callCount: 1,
        retry: true,
      });
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-|web_search|query/);
    },
  );
  it("shares one correction allowance across rounds and stops on a second invalid reply", async () => {
    let requests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(payload("responses", ++requests === 2 ? "fixed" : ""))),
    );
    const state = { used: false };
    await invoke("responses", state);
    await expect(invoke("responses", state)).rejects.toMatchObject({ issue: "missing_call_id" });
    expect(requests).toBe(3);
  });
  it("continues a pending correction across a context retry, then clears only the pending flag", async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        bodies.push(String(init?.body));
        if (bodies.length === 1) return Response.json(payload("responses"));
        if (bodies.length === 2)
          return Response.json(
            {
              error: {
                code: "context_length_exceeded",
                message: "maximum context length exceeded",
              },
            },
            { status: 400 },
          );
        return Response.json(payload("responses", "fixed"));
      }),
    );
    const state: ToolReplyRetryState = { used: false };
    await expect(invoke("responses", state)).rejects.toMatchObject({
      code: "context_length_exceeded",
    });
    expect(state).toEqual({ used: true, pending: true });
    await expect(invoke("responses", state)).resolves.toMatchObject({ calls: [{ id: "fixed" }] });
    expect(bodies[2]).toContain("上一批工具调用因格式校验失败");
    expect(state).toEqual({ used: true, pending: false });
    await invoke("responses", state);
    expect(bodies[3]).not.toContain("上一批工具调用因格式校验失败");
  });
  it("does not retry if cancellation is detected at the checkpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(payload("responses"))),
    );
    await expect(
      invoke("responses", { used: false }, async () => {
        throw new Error("cancelled");
      }),
    ).rejects.toThrow("cancelled");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([false, true])(
    "does not reset the deadline when the budget expires (at checkpoint: %s)",
    async (atCheckpoint) => {
      let now = 1000;
      vi.spyOn(Date, "now").mockImplementation(() => now);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          if (!atCheckpoint) now += 10000;
          return Response.json(payload("responses"));
        }),
      );
      const checkpoint = vi.fn(async () => {
        now += 10000;
      });
      await expect(invoke("responses", { used: false }, checkpoint)).rejects.toMatchObject({
        issue: "missing_call_id",
      });
      expect(fetch).toHaveBeenCalledOnce();
      expect(checkpoint).toHaveBeenCalledTimes(atCheckpoint ? 1 : 0);
    },
  );
  it("classifies truncated missing fields correctly and does not retry with the same output limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ...payload("responses"), status: "incomplete" })),
    );
    await expect(invoke("responses")).rejects.toMatchObject({
      code: "tool_call_incomplete",
      issue: "missing_call_id",
      truncated: true,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(["http", "timeout", "empty"])(
    "does not treat %s failures as correctable tool formatting",
    async (kind) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          if (kind === "timeout") throw new DOMException("Timed out", "TimeoutError");
          if (kind === "http") return new Response("Unavailable", { status: 503 });
          return Response.json({ output: [] });
        }),
      );
      await expect(invoke("responses")).rejects.toBeDefined();
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
});
