import { env, runInDurableObject, abortAllDurableObjects } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { searchWeb, readWebPage, extractPage } from "../src/server/plugins/web-tools";
import { invokeWebResearch } from "../src/server/plugins/web-research";
import { webResearchInputSchema, type WebResearchPlugin } from "../src/shared/web-research";
import { assistantSchema } from "../src/server/llm";
import { countTextTokens } from "../src/server/tokenizer";
import { creditUnits } from "../src/server/wallet";
import type { Assistant, Protocol } from "../src/shared/types";
import type { WxMessage } from "../src/server/wechat";

const config: WebResearchPlugin = {
  ...webResearchInputSchema.parse({
    name: "联网",
    shortcut: "搜索",
    modelId: "model",
    searchProvider: "tavily",
    searchEndpoint: "https://search.example.com/search",
  }),
  id: "plugin",
  pluginId: "wechatai/web-research",
  version: "1.3.0",
  createdAt: 1,
  hasKey: true,
};
const model: Assistant = {
  ...assistantSchema.parse({
    name: "模型",
    model: "test",
    protocol: "chat-completions",
    baseUrl: "https://llm.example.com",
    systemPrompt: "清晰回答",
    maxOutputTokens: 1024,
    maxInputTokens: 8000,
    contextTokens: 16000,
  }),
  id: "model",
  channelId: "channel",
  channelName: "自建",
  createdAt: 1,
  hasKey: true,
};
const accounts: DurableObjectStub<import("../src/server/personal-account").PersonalAccount>[] = [];
const api = async (stub: (typeof accounts)[number], action: string, payload: unknown = {}) =>
  JSON.parse(await stub.api(action, payload));
afterEach(async () => {
  for (const stub of accounts.splice(0))
    await runInDurableObject(stub, async (_, state) => {
      await state.storage.deleteAlarm();
    });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) =>
      String(url).includes("cloudflare-dns.com")
        ? Response.json({ Answer: [{ type: 1, data: "1.1.1.1" }] })
        : handler(String(url), init),
    ),
  );
}
function toolReply(
  protocol: Protocol,
  text: string,
  calls: { id: string; name: string; args: unknown }[] = [],
) {
  if (protocol === "responses")
    return {
      status: "completed",
      output: [
        ...(calls.length
          ? [{ type: "reasoning", id: "rs_1", summary: [], encrypted_content: "opaque-reasoning" }]
          : []),
        ...calls.map((c) => ({
          type: "function_call",
          id: `fc_${c.id}`,
          call_id: c.id,
          name: c.name,
          arguments: JSON.stringify(c.args),
          status: "completed",
        })),
        ...(text
          ? [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }]
          : []),
      ],
    };
  if (protocol === "anthropic")
    return {
      stop_reason: calls.length ? "tool_use" : "end_turn",
      content: [
        ...(calls.length
          ? [{ type: "thinking", thinking: "private-thought", signature: "signed-thought" }]
          : []),
        ...calls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.args })),
        ...(text ? [{ type: "text", text }] : []),
      ],
    };
  return {
    choices: [
      {
        finish_reason: calls.length ? "tool_calls" : "stop",
        message: {
          role: "assistant",
          content: text || null,
          ...(calls.length
            ? {
                reasoning_content: "private-thought",
                tool_calls: calls.map((c) => ({
                  id: c.id,
                  type: "function",
                  function: { name: c.name, arguments: JSON.stringify(c.args) },
                })),
              }
            : {}),
        },
      },
    ],
    usage: { prompt_tokens: 900000, completion_tokens: 900000 },
  };
}
function mockLoop(protocol: Protocol = "chat-completions", failure = false) {
  const calls: { url: string; init?: RequestInit }[] = [];
  let turn = 0;
  mockFetch((url, init) => {
    calls.push({ url, init });
    if (url.startsWith("https://search.example.com"))
      return failure
        ? new Response("secret-debug-must-not-leak", { status: 401 })
        : Response.json({
            results: [
              { url: "https://docs.example.com/article", title: "官方资料", content: "搜索摘要" },
            ],
            usage: { input_tokens: 9999999 },
          });
    if (url.startsWith("https://docs.example.com")) {
      expect(new Headers(init?.headers).get("authorization")).toBeNull();
      expect(new Headers(init?.headers).get("x-api-key")).toBeNull();
      return new Response("<main><h1>文章</h1><p>公开资料</p><script>malicious()</script></main>", {
        headers: { "content-type": "text/html" },
      });
    }
    if (!url.startsWith("https://llm.example.com")) throw new Error("Unexpected destination");
    const body = JSON.parse(String(init?.body));
    const step = turn++ % 3;
    expect(body.tools).toHaveLength(2);
    expect(body.tool_choice).toEqual(protocol === "anthropic" ? { type: "auto" } : "auto");
    if (step > 0) {
      const payload = JSON.stringify(body);
      expect(payload).toContain("search_1");
      expect(payload).toContain(
        protocol === "responses"
          ? "opaque-reasoning"
          : protocol === "anthropic"
            ? "signed-thought"
            : "private-thought",
      );
      if (protocol === "chat-completions")
        expect(body.messages.find((m: { role: string }) => m.role === "tool")).toMatchObject({
          tool_call_id: "search_1",
        });
      else if (protocol === "responses")
        expect(
          body.input.find((m: { type: string }) => m.type === "function_call_output"),
        ).toMatchObject({ call_id: "search_1" });
      else
        expect(body.messages.at(-1).content[0]).toMatchObject({
          type: "tool_result",
          tool_use_id: step === 1 ? "search_1" : "read_1",
        });
    }
    return Response.json(
      toolReply(
        protocol,
        step === 2
          ? "根据资料，这是答案 [1]。伪造 [99] [网站](https://fabricated.example.com)"
          : "正在查找资料",
        step === 0
          ? [{ id: "search_1", name: "web_search", args: { query: "最新资料" } }]
          : step === 1
            ? [
                {
                  id: "read_1",
                  name: "web_fetch",
                  args: { url: "https://docs.example.com/article" },
                },
              ]
            : [],
      ),
    );
  });
  return calls;
}
async function invoke(protocol: Protocol = "chat-completions", overrides = {}) {
  return invokeWebResearch(
    env,
    { ...model, protocol, ...overrides },
    "model-key",
    [{ role: "user", content: "帮我查最新资料" }],
    1024,
    Date.now() + 100000,
    "run",
    "session",
    null,
    config,
    "search-key",
    async () => {},
  );
}
async function setup(plus = true) {
  const stub = env.ACCOUNTS.getByName(crypto.randomUUID());
  accounts.push(stub);
  const saved = await api(stub, "assistant.save", { ...model, id: undefined, apiKey: "model-key" });
  expect(saved.ok).toBe(true);
  await api(stub, "wechat.create", { name: "我的微信" });
  if (plus)
    await stub.applyPayment({
      id: "plus",
      kind: "subscription",
      units: 0,
      expires: Date.now() + 86400000,
    });
  const input = { ...config, id: undefined, modelId: saved.data.id, apiKey: "search-key" };
  return { stub, input, modelId: saved.data.id as string };
}
function send(
  stub: (typeof accounts)[number],
  text: string,
  id: string = crypto.randomUUID(),
  connectionId = "default",
) {
  return runInDurableObject(stub, (instance) =>
    (
      instance as unknown as {
        processWechat(id: string, m: WxMessage, link: string): Promise<string>;
      }
    ).processWechat(id, { item_list: [{ type: 1, text_item: { text } }] }, connectionId),
  );
}

describe("user supplied search adapters", () => {
  it.each([undefined, "", "   "])(
    "sends a default DeepSeek model when searchModel is %j",
    async (searchModel) => {
      const input = webResearchInputSchema.parse({
        ...config,
        searchProvider: "deepseek",
        searchModel,
      });
      let searches = 0;
      mockFetch((url, init) => {
        searches++;
        expect(url).toBe(config.searchEndpoint);
        expect(JSON.parse(String(init?.body))).toMatchObject({
          model: "deepseek-flash",
          tools: [{ name: "web_search" }],
        });
        return Response.json({
          content: [
            {
              type: "web_search_tool_result",
              content: [{ type: "web_search_result", url: "https://example.com/a", title: "A" }],
            },
          ],
        });
      });
      expect(
        await searchWeb({ ...config, ...input }, "mine", "天气", AbortSignal.timeout(10000)),
      ).toEqual([{ url: "https://example.com/a", title: "A", text: "" }]);
      expect(searches).toBe(1);
    },
  );
  it.each(["tavily", "exa", "searxng", "deepseek"] as const)(
    "normalizes %s and sends the key only to the configured endpoint",
    async (provider) => {
      mockFetch((url, init) => {
        expect(url.startsWith(config.searchEndpoint)).toBe(true);
        expect(init?.redirect).toBe("manual");
        const headers = new Headers(init?.headers);
        expect(
          headers.get(
            provider === "exa" || provider === "deepseek" ? "x-api-key" : "authorization",
          ),
        ).toBe(provider === "exa" || provider === "deepseek" ? "mine" : "Bearer mine");
        if (provider === "searxng") {
          expect(new URL(url).searchParams.get("q")).toBe("天气");
          expect(init?.body).toBeUndefined();
        } else
          expect(JSON.parse(String(init?.body))).toMatchObject(
            provider === "deepseek"
              ? { model: "search-model", tools: [{ name: "web_search" }] }
              : { query: "天气" },
          );
        return Response.json(
          provider === "deepseek"
            ? {
                content: [
                  {
                    type: "web_search_tool_result",
                    content: [
                      { type: "web_search_result", url: "https://example.com/a", title: "A" },
                    ],
                  },
                  {
                    type: "text",
                    citations: [{ url: "https://example.com/a", cited_text: "正文" }],
                  },
                ],
              }
            : {
                results: [
                  { url: "https://example.com/a", title: "A", content: "正文" },
                  { url: "http://127.0.0.1/" },
                  { url: "https://example.com/a" },
                ],
              },
        );
      });
      expect(
        await searchWeb(
          { ...config, searchProvider: provider, searchModel: "search-model" },
          "mine",
          "天气",
          AbortSignal.timeout(10000),
        ),
      ).toEqual([{ url: "https://example.com/a", title: "A", text: "正文" }]);
    },
  );
  it("does not invent a default search key or accept DeepSeek prose as executed search", async () => {
    mockFetch(() => Response.json({ content: [{ type: "text", text: "I searched the web" }] }));
    await expect(searchWeb(config, "", "q", AbortSignal.timeout(10000))).rejects.toThrow("API Key");
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      searchWeb(
        { ...config, searchProvider: "deepseek", searchModel: "model" },
        "key",
        "q",
        AbortSignal.timeout(10000),
      ),
    ).rejects.toThrow("真实搜索结果");
  });
  it("refuses search redirects without forwarding any credentials", async () => {
    let calls = 0;
    mockFetch(() => {
      calls++;
      return new Response(null, {
        status: 302,
        headers: { location: "https://other.example.com" },
      });
    });
    await expect(searchWeb(config, "key", "q", AbortSignal.timeout(10000))).rejects.toThrow(
      "搜索服务",
    );
    expect(calls).toBe(1);
  });
  it("extracts readable content, blocks private redirects and bounds response size", async () => {
    const text = await extractPage(
      "<h1>标题</h1><p>你好 &amp; 世界</p><nav>导航</nav><script>secret</script><div hidden>hidden</div>",
    );
    expect(text).toContain("你好");
    expect(text).not.toMatch(/secret|导航|hidden/);
    mockFetch(
      () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } }),
    );
    await expect(readWebPage("https://example.com", AbortSignal.timeout(10000))).rejects.toThrow();
    mockFetch(
      () => new Response("a".repeat(1000001), { headers: { "content-type": "text/plain" } }),
    );
    await expect(readWebPage("https://example.com", AbortSignal.timeout(10000))).rejects.toThrow(
      "过大",
    );
  });
});

describe("bounded web research runtime", () => {
  it.each(["chat-completions", "responses", "anthropic"] as const)(
    "answers directly via %s without touching search or reading and preserves normal Markdown",
    async (protocol) => {
      let calls = 0;
      const answer = "你好！可以用 `items[1]`，参考 [文档](https://example.com/docs)。";
      mockFetch((url, init) => {
        expect(url).toContain("llm.example.com");
        const body = String(init?.body);
        expect(body).not.toContain("answer 可以作为第一步");
        expect(body).toContain("web_search");
        calls++;
        return Response.json(toolReply(protocol, answer));
      });
      const result = await invoke(protocol);
      expect(calls).toBe(1);
      expect(result.text).toBe(answer);
      expect(result.text).not.toContain("来源：");
      expect(result.units).toBe(creditUnits(result.inputTokens, countTextTokens(answer)));
    },
  );
  it.each(["chat-completions", "responses", "anthropic"] as const)(
    "uses compatibility only after %s explicitly rejects native tools",
    async (protocol) => {
      let native = 0,
        legacy = 0;
      mockFetch((url, init) => {
        expect(url).toContain("llm.example.com");
        const body = JSON.parse(String(init?.body));
        if (body.tools) {
          native++;
          return Response.json(
            { error: { message: "This model does not support tools", param: "tools" } },
            { status: 400 },
          );
        }
        return Response.json(
          toolReply(protocol, legacy++ === 0 ? '{"action":"answer"}' : "兼容回答"),
        );
      });
      const result = await invoke(protocol);
      expect(result.text).toBe("兼容回答");
      expect(native).toBe(1);
      expect(legacy).toBe(2);
      expect(result.units).toBe(creditUnits(result.inputTokens, countTextTokens("兼容回答")));
    },
  );
  it.each([
    [401, "tools is not supported"],
    [429, "tools is not supported"],
    [500, "tools is not supported"],
    [400, "Invalid schema: tools has unsupported properties"],
    [422, "Invalid tool arguments"],
  ])("does not downgrade or retry HTTP %s: %s", async (status, message) => {
    let calls = 0;
    mockFetch(() => {
      calls++;
      return Response.json({ error: { message, param: "tools" } }, { status: Number(status) });
    });
    await expect(invoke()).rejects.toThrow(`模型服务返回 ${status}`);
    expect(calls).toBe(1);
  });
  it("does not downgrade a malformed successful response or a network timeout", async () => {
    let calls = 0;
    mockFetch(() => {
      calls++;
      return Response.json({ choices: [] });
    });
    await expect(invoke()).rejects.toThrow("没有返回文字或工具调用");
    expect(calls).toBe(1);
    calls = 0;
    mockFetch(() => {
      calls++;
      throw new DOMException("timeout", "TimeoutError");
    });
    await expect(invoke()).rejects.toThrow("timeout");
    expect(calls).toBe(1);
  });
  it.each(["chat-completions", "responses", "anthropic"] as const)(
    "handles multiple %s tool calls and returns every call ID before continuing",
    async (protocol) => {
      let turns = 0;
      mockFetch((url, init) => {
        if (url.includes("search.example.com"))
          return Response.json({
            results: [
              { title: "资料", url: "https://docs.example.com/article", content: "资料正文" },
            ],
          });
        if (url.includes("docs.example.com"))
          return new Response("正文", { headers: { "content-type": "text/plain" } });
        const body = JSON.parse(String(init?.body));
        if (turns++ === 0)
          return Response.json(
            toolReply(protocol, "中间内容不应展示", [
              { id: "search_a", name: "web_search", args: { query: "资料" } },
              {
                id: "fetch_b",
                name: "web_fetch",
                args: { url: "https://docs.example.com/article" },
              },
            ]),
          );
        if (protocol === "responses")
          expect(
            body.input
              .filter((v: { type: string }) => v.type === "function_call_output")
              .map((v: { call_id: string }) => v.call_id),
          ).toEqual(["search_a", "fetch_b"]);
        else if (protocol === "anthropic")
          expect(
            body.messages.at(-1).content.map((v: { tool_use_id: string }) => v.tool_use_id),
          ).toEqual(["search_a", "fetch_b"]);
        else
          expect(
            body.messages
              .filter((v: { role: string }) => v.role === "tool")
              .map((v: { tool_call_id: string }) => v.tool_call_id),
          ).toEqual(["search_a", "fetch_b"]);
        return Response.json(toolReply(protocol, "最终回答 [1]"));
      });
      const result = await invoke(protocol);
      expect(turns).toBe(2);
      expect(result.text).toContain("最终回答");
      expect(result.text).not.toContain("中间内容");
      expect(result.units).toBe(creditUnits(result.inputTokens, countTextTokens(result.text)));
    },
  );
  it("caps actual searches, returns excess calls as errors and forces a final answer", async () => {
    let searches = 0,
      turns = 0;
    mockFetch((url, init) => {
      if (url.includes("search.example.com")) {
        searches++;
        return Response.json({
          results: [
            { title: "资料", url: "https://docs.example.com/article", content: "真实结果" },
          ],
        });
      }
      const body = JSON.parse(String(init?.body));
      if (turns++ === 0)
        return Response.json(
          toolReply(
            "chat-completions",
            "",
            Array.from({ length: 4 }, (_, n) => ({
              id: `s_${n}`,
              name: "web_search",
              args: { query: `q${n}` },
            })),
          ),
        );
      expect(body.tool_choice).toBe("none");
      expect(body.messages.filter((v: { role: string }) => v.role === "tool")).toHaveLength(4);
      expect(body.messages.at(-1).content).toContain("搜索次数已用完");
      return Response.json(toolReply("chat-completions", "回答 [1]"));
    });
    const result = await invokeWebResearch(
      env,
      model,
      "model-key",
      [{ role: "user", content: "查资料" }],
      1024,
      Date.now() + 100000,
      "run",
      "session",
      null,
      { ...config, maxSearches: 1, maxReads: 0 },
      "search-key",
      async () => {},
    );
    expect(searches).toBe(1);
    expect(turns).toBe(2);
    expect(result.text).toContain("来源");
  });
  it("returns invalid tool arguments to the model for correction without fetching arbitrary tools", async () => {
    let turns = 0,
      searches = 0;
    mockFetch((url, init) => {
      if (url.includes("search.example.com")) {
        searches++;
        return Response.json({
          results: [{ title: "资料", url: "https://docs.example.com/article", content: "结果" }],
        });
      }
      expect(url).toContain("llm.example.com");
      const body = JSON.parse(String(init?.body));
      const step = turns++;
      if (step === 0)
        return Response.json(
          toolReply("chat-completions", "", [
            { id: "bad", name: "execute_code", args: { code: "fetch secrets" } },
          ]),
        );
      if (step === 1) {
        expect(body.messages.at(-1).content).toContain("工具名称或参数无效");
        return Response.json(
          toolReply("chat-completions", "", [
            { id: "fixed", name: "web_search", args: { query: "资料" } },
          ]),
        );
      }
      return Response.json(toolReply("chat-completions", "回答 [1]"));
    });
    expect((await invoke()).text).toContain("来源");
    expect(searches).toBe(1);
    expect(turns).toBe(3);
  });
  it("does not turn an empty search into a fake successful direct answer", async () => {
    let calls = 0;
    mockFetch((url) => {
      if (url.includes("search.example.com")) return Response.json({ results: [] });
      return Response.json(
        toolReply(
          "chat-completions",
          calls++ === 0 ? "" : "假装成功",
          calls === 1 ? [{ id: "s1", name: "web_search", args: { query: "今日新闻" } }] : [],
        ),
      );
    });
    await expect(invoke()).rejects.toThrow("没有找到可用");
    expect(calls).toBe(2);
  });
  it.each(["chat-completions", "responses", "anthropic"] as const)(
    "runs search/read/answer via %s, verifies sources and bills only the boundary",
    async (protocol) => {
      const calls = mockLoop(protocol);
      const result = await invoke(protocol);
      expect(calls).toHaveLength(5);
      expect(result.text).toContain("https://docs.example.com/article");
      expect(result.text).not.toMatch(/fabricated|\[99\]/);
      expect(result.inputTokens).toBe(
        countTextTokens(model.systemPrompt) + countTextTokens("帮我查最新资料"),
      );
      expect(result.outputTokens).toBe(countTextTokens(result.text));
      expect(result.units).toBe(creditUnits(result.inputTokens, result.outputTokens));
      expect(result.units).toBeLessThan(1000);
    },
  );
  it("fails actionably when search credentials fail and does not invent an answer", async () => {
    const calls = mockLoop("chat-completions", true);
    await expect(invoke()).rejects.toThrow("API Key");
    expect(calls).toHaveLength(2);
  });
  it("rejects insufficient input space and invalid planner output with a bounded retry", async () => {
    mockLoop();
    await expect(invoke("chat-completions", { maxInputTokens: 100 })).rejects.toThrow("输入空间");
    let calls = 0;
    mockFetch((_url, init) => {
      calls++;
      if (JSON.parse(String(init?.body)).tools)
        return Response.json(
          { error: { param: "tools", message: "tools is not supported" } },
          { status: 400 },
        );
      return Response.json({ choices: [{ message: { content: "I cannot use tools" } }] });
    });
    await expect(invoke()).rejects.toThrow("JSON");
    expect(calls).toBe(3);
  });
  it("does not fetch URLs invented by a planner", async () => {
    let calls = 0;
    mockFetch((url) => {
      expect(url).toContain("llm.example.com");
      return Response.json(
        toolReply(
          "chat-completions",
          calls++ === 0 ? "" : "回答",
          calls === 1
            ? [{ id: "r1", name: "web_fetch", args: { url: "https://unknown.example.com/exfil" } }]
            : [],
        ),
      );
    });
    await expect(invoke()).rejects.toThrow("用户或搜索结果");
    expect(calls).toBeLessThanOrEqual(5);
  });
});

describe("Plugin configuration, routing and settlement", () => {
  it("keeps each WeChat link's default plugin and return conversation independent", async () => {
    const { stub, input, modelId } = await setup();
    await api(stub, "plugin.save", input);
    const firstPlain = (await stub.snapshot()).currentSession!.id;
    const secondLink = (await api(stub, "wechat.create", { name: "另一个微信" })).data
      .selectedConnectionId;
    const secondPlain = (
      await api(stub, "assistant.activate", { id: modelId, connectionId: secondLink })
    ).data.id;
    await send(stub, "/use 搜索", undefined, secondLink);
    const secondPlugin = (await stub.snapshot()).currentSession!.id;
    await send(stub, "/use 搜索");
    expect((await stub.snapshot()).currentSession!.id).toBe(secondPlugin);
    await send(stub, "/exit");
    let state = await stub.snapshot();
    expect(state.connections.find((l) => l.id === "default")?.currentSessionId).toBe(firstPlain);
    expect(state.currentSession!.id).toBe(secondPlugin);
    await send(stub, "/exit", undefined, secondLink);
    state = await stub.snapshot();
    expect(state.currentSession!.id).toBe(secondPlain);
    expect(state.connections.find((l) => l.id === "default")?.currentSessionId).toBe(firstPlain);
  });
  it("can exit after the return conversation is deleted and Plus expires", async () => {
    const { stub, input } = await setup();
    const original = (await stub.snapshot()).currentSession!.id;
    await api(stub, "plugin.save", input);
    await send(stub, "/use 搜索");
    expect(await api(stub, "session.action", { id: original, action: "delete" })).toMatchObject({
      ok: true,
    });
    await runInDurableObject(stub, (_, state) =>
      state.storage.sql.exec("UPDATE settings SET value = '0' WHERE key = 'planUntil'"),
    );
    expect(await send(stub, "/exit")).toContain("已退出插件");
    const state = await stub.snapshot();
    expect(state.currentSession?.id).not.toBe(original);
    expect(state.currentSession?.pluginInstanceId).toBeUndefined();
  });
  it("invokes @ once in the current conversation without changing modes or creating a plugin session", async () => {
    const { stub, input } = await setup();
    await api(stub, "plugin.save", input);
    const original = (await stub.snapshot()).currentSession!.id;
    expect(await send(stub, "@搜索")).toContain("只用于单次调用");
    expect((await stub.snapshot()).currentSession!.id).toBe(original);
    mockLoop();
    const answer = await send(stub, "@搜索 帮我查资料");
    expect((await stub.snapshot()).currentSession).toMatchObject({ id: original });
    expect((await stub.snapshot()).currentSession?.pluginInstanceId).toBeUndefined();
    const sessions = await api(stub, "session.list");
    expect(sessions.data).toHaveLength(1);
    const messages = await api(stub, "session.messages", { id: original });
    expect(messages.data.at(-1).content).toBe(answer);
    let normalCalls = 0;
    mockFetch((url, init) => {
      expect(url).toContain("llm.example.com");
      expect(String(init?.body)).toContain("根据资料，这是答案");
      expect(String(init?.body)).not.toContain("answer 可以作为第一步");
      normalCalls++;
      return Response.json({ choices: [{ message: { content: "继续普通对话" } }] });
    });
    expect(await send(stub, "总结刚才的回答")).toBe("继续普通对话");
    expect(normalCalls).toBe(1);
    mockLoop("chat-completions", true);
    await expect(send(stub, "@搜索 查一下")).rejects.toThrow("API Key");
    expect((await stub.snapshot()).currentSession?.id).toBe(original);
  });
  it("returns to the original conversation after nested plugin use, temporary model calls, disabling or deleting the active plugin", async () => {
    const { stub, input, modelId } = await setup();
    const original = (await stub.snapshot()).currentSession!.id;
    const a = await api(stub, "plugin.save", input);
    const b = await api(stub, "plugin.save", { ...input, name: "研究 B", shortcut: "B" });
    await send(stub, "/plugins");
    await send(stub, "/use 搜索");
    const sessionA = (await stub.snapshot()).currentSession!.id;
    mockLoop();
    await send(stub, "@B 查资料");
    expect((await stub.snapshot()).currentSession).toMatchObject({
      id: sessionA,
      pluginInstanceId: a.data.id,
    });
    // A named model can also be invoked once from plugin mode, without running a planner.
    const savedModel = (await stub.snapshot()).assistants.find((m) => m.id === modelId)!;
    await api(stub, "model.save", { ...savedModel, shortcut: "普通" });
    mockFetch(() => Response.json({ choices: [{ message: { content: "普通回答" } }] }));
    expect(await send(stub, "@普通：你好")).toBe("普通回答");
    expect((await stub.snapshot()).currentSession?.id).toBe(sessionA);
    expect(await send(stub, "/use B")).toContain("已切换到");
    expect((await stub.snapshot()).currentSession?.pluginInstanceId).toBe(b.data.id);
    await api(stub, "plugin.save", {
      ...input,
      id: b.data.id,
      name: "研究 B",
      shortcut: "B",
      enabled: false,
    });
    expect(await send(stub, "/exit")).toContain("已退出插件");
    expect((await stub.snapshot()).currentSession?.id).toBe(original);
    await send(stub, "/use 搜索");
    await api(stub, "plugin.delete", { id: a.data.id });
    expect(await api(stub, "plugin.exit")).toMatchObject({ ok: true, data: { id: original } });
  });
  it.each(["联网问答", "DeepSeek"])(
    "migrates old stock name %s without changing aliases, secrets or custom names",
    async (oldName) => {
      const setupResult = await setup();
      let stub = setupResult.stub;
      const p = await api(stub, "plugin.save", setupResult.input);
      const custom = await api(stub, "plugin.save", {
        ...setupResult.input,
        name: "我的助手",
        shortcut: "custom",
      });
      const key = await runInDurableObject(stub, (_, state) => {
        const row = state.storage.sql
          .exec<{ data: string }>("SELECT data FROM plugins WHERE id = ?", p.data.id)
          .one();
        const old = JSON.parse(row.data);
        state.storage.sql.exec(
          "UPDATE plugins SET data = ? WHERE id = ?",
          JSON.stringify({ ...old, name: oldName, version: "1.0.0" }),
          p.data.id,
        );
        return old.encryptedKey;
      });
      await abortAllDurableObjects();
      stub = env.ACCOUNTS.get(stub.id);
      accounts[0] = stub;
      const snapshot = await stub.snapshot();
      expect(snapshot.plugins?.find((v) => v.id === p.data.id)).toMatchObject({
        name: "DS Chat",
        shortcut: "搜索",
        version: "1.3.0",
      });
      expect(snapshot.plugins?.find((v) => v.id === custom.data.id)?.name).toBe("我的助手");
      await runInDurableObject(stub, (_, state) =>
        expect(
          JSON.parse(
            state.storage.sql
              .exec<{ data: string }>("SELECT data FROM plugins WHERE id = ?", p.data.id)
              .one().data,
          ).encryptedKey,
        ).toBe(key),
      );
      expect(await send(stub, "/use 搜索")).toContain("已进入");
      expect(await send(stub, "/exit")).toContain("已退出插件");
    },
  );
  it("lets Plus create, edit and activate plugins beyond twenty configurations", async () => {
    const { stub, input } = await setup();
    let lastId = "";
    for (let i = 1; i <= 25; i++) {
      const saved = await api(stub, "plugin.save", {
        ...input,
        name: `研究 ${i}`,
        shortcut: `research${i}`,
      });
      expect(saved.ok).toBe(true);
      lastId = saved.data.id;
    }
    expect((await stub.snapshot()).plugins).toHaveLength(25);
    expect(
      await api(stub, "plugin.save", {
        ...input,
        id: lastId,
        name: "更新第 25 个配置",
        shortcut: "research25",
      }),
    ).toMatchObject({ ok: true });
    expect(await api(stub, "plugin.activate", { id: lastId })).toMatchObject({ ok: true });
    expect((await stub.snapshot()).currentSession?.pluginInstanceId).toBe(lastId);
  });
  it("cannot exceed the Free slot with concurrent encrypted saves", async () => {
    const { stub, input } = await setup(false);
    const results = await Promise.all([
      api(stub, "plugin.save", { ...input, shortcut: "one" }),
      api(stub, "plugin.save", { ...input, shortcut: "two" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: "plugin_limit" });
    expect((await stub.snapshot()).plugins).toHaveLength(1);
  });
  it("allows one Free plugin, encrypts secrets, enforces unique names and requires a fresh key on destination changes", async () => {
    const { stub, input } = await setup(false);
    const p = await api(stub, "plugin.save", input);
    expect(p.ok).toBe(true);
    expect(await api(stub, "plugin.save", { ...input, shortcut: "second" })).toMatchObject({
      error: "plugin_limit",
      status: 403,
    });
    expect(await api(stub, "plugin.save", { ...input, id: p.data.id, name: "更新" })).toMatchObject(
      { ok: true },
    );
    await stub.applyPayment({
      id: "plus",
      kind: "subscription",
      units: 0,
      expires: Date.now() + 86400000,
    });
    expect(JSON.stringify(await stub.snapshot())).not.toMatch(/search-key|encryptedKey|apiKey/);
    await runInDurableObject(stub, (_, state) =>
      expect(
        state.storage.sql.exec<{ data: string }>("SELECT data FROM plugins").one().data,
      ).not.toContain("search-key"),
    );
    expect(await api(stub, "plugin.save", input)).toMatchObject({
      ok: false,
      error: "shortcut_exists",
    });
    expect(
      await api(stub, "plugin.save", {
        ...input,
        id: p.data.id,
        apiKey: "",
        searchEndpoint: "https://other.example.com/search",
      }),
    ).toMatchObject({ ok: false, error: "search_key_missing" });
    expect(
      await api(stub, "plugin.save", { ...input, id: p.data.id, apiKey: "", name: "新名字" }),
    ).toMatchObject({ ok: true });
  });
  it("keeps plugin and model sessions separate, resumes them, persists across restarts and charges a repeated delivery once", async () => {
    const setupResult = await setup();
    let stub = setupResult.stub;
    const { input, modelId } = setupResult;
    const p = await api(stub, "plugin.save", input);
    expect(p.ok).toBe(true);
    const original = (await stub.snapshot()).currentSession!.id;
    expect(await send(stub, "/use 搜索")).toContain("已进入");
    mockLoop();
    const answer = await send(stub, "@搜索 帮我查资料", "same-message");
    const first = await stub.snapshot();
    expect(first.currentSession?.pluginInstanceId).toBe(p.data.id);
    const sessionId = first.currentSession!.id;
    expect(sessionId).not.toBe(original);
    expect(await send(stub, "@搜索 帮我查资料", "same-message")).toBe(answer);
    expect((await stub.snapshot()).wallet.balance).toBe(first.wallet.balance);
    await abortAllDurableObjects();
    stub = env.ACCOUNTS.get(stub.id);
    accounts[0] = stub;
    expect((await stub.snapshot()).currentSession?.pluginInstanceId).toBe(p.data.id);
    expect(await send(stub, "/exit")).toContain("已退出插件");
    expect((await stub.snapshot()).currentSession?.id).toBe(original);
    expect(await send(stub, "@搜索 帮我查资料", "same-message")).toBe(answer);
    expect((await stub.snapshot()).currentSession?.id).toBe(original);
    expect(await api(stub, "assistant.activate", { id: modelId })).toMatchObject({
      ok: true,
      data: { id: original },
    });
    expect(await api(stub, "plugin.activate", { id: p.data.id })).toMatchObject({
      ok: true,
      data: { id: sessionId },
    });
    await send(stub, "/new");
    expect((await stub.snapshot()).currentSession?.pluginInstanceId).toBe(p.data.id);
    await runInDurableObject(stub, (_, state) => {
      expect(
        state.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM platform_metering").one()
          .n,
      ).toBe(1);
      expect(
        state.storage.sql.exec<{ pluginId: string }>("SELECT pluginId FROM platform_metering").one()
          .pluginId,
      ).toBe("wechatai/web-research");
      state.storage.sql.exec("UPDATE settings SET value = '0' WHERE key = 'planUntil'");
    });
    expect(await send(stub, "继续查询")).toContain("根据资料");
    expect(await api(stub, "plugin.test", { id: p.data.id, query: "test" })).toMatchObject({
      ok: true,
    });
    await send(stub, "/wx archive");
    expect((await stub.snapshot()).currentSession?.pluginInstanceId).toBe(p.data.id);
    expect(await send(stub, "/exit")).toContain("已退出插件");
    expect((await stub.snapshot()).currentSession?.id).toBe(original);
    expect(await api(stub, "plugin.delete", { id: p.data.id })).toMatchObject({ ok: true });
    await api(stub, "assistant.activate", { id: modelId });
    expect((await stub.snapshot()).currentSession?.id).toBe(original);
  });
  it("rejects conflicting legacy context limits in tests and WeChat, and resumes after repair", async () => {
    const { stub, input, modelId } = await setup();
    const p = await api(stub, "plugin.save", input);
    await send(stub, "/use 搜索");
    await runInDurableObject(stub, (_, state) => {
      const saved = JSON.parse(
        state.storage.sql
          .exec<{ data: string }>("SELECT data FROM assistants WHERE id = ?", modelId)
          .one().data,
      );
      delete saved.maxInputTokens;
      state.storage.sql.exec(
        "UPDATE assistants SET data = ? WHERE id = ?",
        JSON.stringify({ ...saved, contextTokens: 8000, maxOutputTokens: 8192 }),
        modelId,
      );
    });
    const before = await stub.snapshot();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Unexpected network"))),
    );
    for (const [action, payload] of [
      ["plugin.test", { id: p.data.id, query: "你好" }],
      ["assistant.test", { id: modelId }],
    ] as const)
      expect(await api(stub, action, payload)).toMatchObject({
        ok: false,
        error: "invalid_context_window",
        status: 422,
        message: expect.stringContaining("8,192"),
      });
    await expect(send(stub, "你好")).rejects.toThrow("模型配置冲突");
    expect(fetch).not.toHaveBeenCalled();
    const after = await stub.snapshot();
    expect(after.wallet.balance).toBe(before.wallet.balance);
    expect(after.currentSession).toEqual(before.currentSession);

    const a = after.assistants.find((m) => m.id === modelId)!;
    expect(await api(stub, "model.save", { ...a, contextTokens: 128000 })).toMatchObject({
      ok: true,
      data: { maxInputTokens: 8000, maxOutputTokens: 8192, contextTokens: 128000 },
    });
    mockFetch((_, init) => {
      expect(JSON.parse(String(init?.body)).max_completion_tokens).toBe(8192);
      return Response.json(toolReply("chat-completions", "你好，已恢复"));
    });
    expect(await send(stub, "你好")).toBe("你好，已恢复");
  });
  it("does not charge failures or permit disabled plugins", async () => {
    const { stub, input } = await setup();
    const p = await api(stub, "plugin.save", input);
    const balance = (await stub.snapshot()).wallet.balance;
    mockLoop("chat-completions", true);
    const result = await api(stub, "plugin.test", { id: p.data.id, query: "查资料" });
    expect(result).toMatchObject({ ok: false, error: "search_failed" });
    expect(JSON.stringify(result)).not.toContain("secret-debug");
    expect((await stub.snapshot()).wallet.balance).toBe(balance);
    await api(stub, "plugin.save", { ...input, id: p.data.id, enabled: false });
    expect(await api(stub, "plugin.activate", { id: p.data.id })).toMatchObject({
      ok: false,
      error: "plugin_disabled",
    });
  });
});
