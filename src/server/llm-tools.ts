import type { Assistant, Protocol } from "../shared/types";
import { modelInputBudget } from "../shared/context";
import { AppError } from "./config";
import {
  buildRequest,
  contextLimitError,
  estimateTokens,
  requestModel,
  modelImages,
  type ModelMessage,
} from "./llm";
import { countTextTokens, limitTextTokens } from "./tokenizer";
import { validateModelBaseUrl } from "./security";

export type ModelTool = { name: string; description: string; parameters: Record<string, unknown> };
export type ModelToolCall = { id: string; name: string; arguments: unknown };
export type ModelToolResult = { id: string; content: string; error?: boolean };
export type ModelToolRound = {
  continuation: Record<string, unknown>[];
  results: ModelToolResult[];
};
export type ModelToolReply = {
  text: string;
  calls: ModelToolCall[];
  continuation: Record<string, unknown>[];
};
const object = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const textBlocks = (v: unknown, type: string) =>
  list(v)
    .filter((p) => object(p).type === type)
    .map((p) => (typeof object(p).text === "string" ? object(p).text : ""))
    .join("\n");
const argumentsOf = (v: unknown) => {
  if (typeof v !== "string") return undefined;
  try {
    return JSON.parse(v) as unknown;
  } catch {
    return undefined;
  }
};

export function buildToolRequest(
  model: Assistant,
  messages: ModelMessage[],
  tools: ModelTool[],
  rounds: ModelToolRound[],
  maxOutput: number,
  allowTools = true,
) {
  const { body } = buildRequest(model, messages, maxOutput);
  if (model.protocol === "responses")
    return {
      ...body,
      // With store:false, encrypted reasoning must travel with function calls on
      // the next request. Never strip/rewrite these opaque continuation items.
      include: ["reasoning.encrypted_content"],
      tools: tools.map((t) => ({ type: "function", ...t, strict: false })),
      tool_choice: allowTools ? "auto" : "none",
      input: [
        ...("input" in body ? body.input : []),
        ...rounds.flatMap((r) => [
          ...r.continuation,
          ...r.results.map((v) => ({
            type: "function_call_output",
            call_id: v.id,
            output: v.content,
          })),
        ]),
      ],
    };
  if (model.protocol === "anthropic")
    return {
      ...body,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
      tool_choice: { type: allowTools ? "auto" : "none" },
      messages: [
        ...("messages" in body ? body.messages : []),
        ...rounds.flatMap((r) => [
          ...r.continuation,
          {
            role: "user",
            content: r.results.map((v) => ({
              type: "tool_result",
              tool_use_id: v.id,
              content: v.content,
              ...(v.error ? { is_error: true } : {}),
            })),
          },
        ]),
      ],
    };
  return {
    ...body,
    tools: tools.map((t) => ({ type: "function", function: { ...t, strict: false } })),
    tool_choice: allowTools ? "auto" : "none",
    messages: [
      ...("messages" in body ? body.messages : []),
      ...rounds.flatMap((r) => [
        ...r.continuation,
        ...r.results.map((v) => ({ role: "tool", tool_call_id: v.id, content: v.content })),
      ]),
    ],
  };
}

export function parseToolReply(protocol: Protocol, raw: unknown): ModelToolReply {
  const data = object(raw);
  const contextError = contextLimitError(data);
  if (contextError) throw contextError;
  if (data.error || data.status === "failed")
    throw new AppError("model_failed", "模型服务未能完成工具请求，请检查配置或稍后重试", 502);
  let text: string;
  let continuation: Record<string, unknown>[];
  let calls: ModelToolCall[];
  let truncated = false;
  if (protocol === "chat-completions") {
    const choice = object(list(data.choices)[0]);
    const message = object(choice.message);
    text =
      typeof message.content === "string" ? message.content : textBlocks(message.content, "text");
    calls = list(message.tool_calls).map((v) => {
      const c = object(v),
        f = object(c.function);
      if (c.type !== "function")
        throw new AppError("tool_call_invalid", "上游返回了不支持的工具类型", 502);
      return { id: c.id as string, name: f.name as string, arguments: argumentsOf(f.arguments) };
    });
    continuation = [
      {
        role: "assistant",
        content: message.content ?? null,
        tool_calls: message.tool_calls,
        ...(typeof message.reasoning_content === "string"
          ? { reasoning_content: message.reasoning_content }
          : {}),
      },
    ];
    truncated = choice.finish_reason === "length" || choice.finish_reason === "content_filter";
  } else if (protocol === "responses") {
    continuation = list(data.output).map(object);
    text = continuation
      .filter((v) => v.type === "message")
      .map((v) => textBlocks(v.content, "output_text"))
      .join("\n");
    calls = continuation
      .filter((v) => v.type === "function_call")
      .map((c) => ({
        id: c.call_id as string,
        name: c.name as string,
        arguments: argumentsOf(c.arguments),
      }));
    truncated =
      data.status === "incomplete" ||
      continuation.some((v) => v.type === "function_call" && v.status === "incomplete");
  } else {
    const content = list(data.content).map(object);
    text = textBlocks(content, "text");
    calls = content
      .filter((v) => v.type === "tool_use")
      .map((c) => ({ id: c.id as string, name: c.name as string, arguments: c.input }));
    // Signed thinking/redacted_thinking blocks are preserved verbatim alongside
    // tool_use blocks. They are never surfaced in the final answer or metered.
    continuation = [{ role: "assistant", content }];
    truncated = data.stop_reason === "max_tokens";
  }
  if (
    calls.length > 8 ||
    calls.some(
      (c) =>
        typeof c.id !== "string" ||
        !c.id ||
        c.id.length > 200 ||
        typeof c.name !== "string" ||
        !c.name ||
        c.name.length > 100,
    ) ||
    new Set(calls.map((c) => c.id)).size !== calls.length
  )
    throw new AppError(
      "tool_call_invalid",
      "模型返回的工具调用无效或过多，请更换模型或缩小问题范围",
      502,
    );
  if (calls.length && truncated)
    throw new AppError("tool_call_incomplete", "工具调用被截断，请提高模型输出上限后重试", 502);
  if (!calls.length && !text.trim())
    throw new AppError("empty_reply", "模型没有返回文字或工具调用，请检查模型或提高输出上限", 502);
  return { text: text.slice(0, 50000), calls, continuation };
}

// Bound the whole native payload, including schemas, call arguments and opaque
// reasoning. Only tool-result text can be shortened; IDs and signatures remain exact.
export function fitToolRequest(
  model: Assistant,
  messages: ModelMessage[],
  tools: ModelTool[],
  rounds: ModelToolRound[],
  maxOutput: number,
  allowTools = true,
  resultLimit = 4000,
) {
  const budget = modelInputBudget(model, maxOutput);
  let limit = resultLimit;
  for (;;) {
    const bounded = rounds.map((r) => ({
      ...r,
      results: r.results.map((v) => ({
        ...v,
        content:
          countTextTokens(v.content) <= limit
            ? v.content
            : limitTextTokens(v.content, Math.max(1, limit - 32)) +
              "\n[工具资料已截断，请仅依据可见内容回答]",
      })),
    }));
    // Base64 is a transport encoding, not model text. Budget image inputs just as
    // the ordinary chat path does, instead of tokenizing megabytes of encoded pixels.
    const budgetMessages = messages.map((m) => ({
      ...m,
      image: undefined,
      images: modelImages(m).map((image) => ({ ...image, data: "" })),
    }));
    const serialized = JSON.stringify(
      buildToolRequest(model, budgetMessages, tools, bounded, maxOutput, allowTools),
    );
    const imageTokens = messages.reduce((n, m) => n + modelImages(m).length * 16_000, 0);
    if (Math.max(estimateTokens(serialized), countTextTokens(serialized)) + imageTokens <= budget)
      return buildToolRequest(model, messages, tools, bounded, maxOutput, allowTools);
    if (!rounds.length || limit <= 64)
      throw new AppError(
        "research_input_limit",
        "DS Chat 需要为工具指令与资料保留输入空间，请提高模型输入上限或用 /new 开始新会话",
        422,
      );
    limit = Math.max(64, Math.floor(limit / 2));
  }
}

export async function callModelWithTools(
  env: Env,
  model: Assistant,
  key: string,
  messages: ModelMessage[],
  tools: ModelTool[],
  rounds: ModelToolRound[],
  output: number,
  timeoutMs: number,
  allowTools = true,
  resultLimit = 4000,
) {
  validateModelBaseUrl(env, model.baseUrl);
  const body = fitToolRequest(model, messages, tools, rounds, output, allowTools, resultLimit);
  return parseToolReply(
    model.protocol,
    await requestModel(env, model, key, body, output, timeoutMs, true),
  );
}
