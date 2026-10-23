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
export type ToolReplyRetryState = { used: boolean; pending?: boolean };
type ToolReplyRecovery = {
  state: ToolReplyRetryState;
  checkpoint: () => Promise<void>;
};
type ToolReplyIssue =
  | "unsupported_tool_type"
  | "invalid_call_list"
  | "too_many_calls"
  | "missing_call_id"
  | "invalid_call_id"
  | "missing_tool_name"
  | "invalid_tool_name"
  | "duplicate_call_id"
  | "reused_call_id"
  | "truncated_calls";

// Only structural metadata belongs in diagnostics. Never retain the rejected
// payload, arguments, reasoning, names or IDs in errors/logs/correction prompts.
export class ToolReplyValidationError extends AppError {
  constructor(
    public issue: ToolReplyIssue,
    public callCount: number,
    public truncated = false,
    public callIndex?: number,
  ) {
    super(
      truncated ? "tool_call_incomplete" : "tool_call_invalid",
      truncated
        ? "工具调用被截断，请提高模型输出上限后重试"
        : "模型返回的工具调用无效或过多，请更换模型或缩小问题范围",
      502,
    );
  }
}

const TOOL_REPLY_CORRECTION =
  "上一批工具调用因格式校验失败被整体拒绝，其中没有任何工具被执行。请重新生成本轮回复：仅使用已提供的原生工具协议与工具名称；每批最多 8 个调用，每个调用必须有非空、唯一且未使用过的编号（最多 200 字符），工具名称最多 100 字符，参数遵循工具定义。已在上下文中返回结果的操作不要重复执行。可以直接回答时正常回答，不要编造工具执行结果。";
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

export function parseToolReply(
  protocol: Protocol,
  raw: unknown,
  usedIds: ReadonlySet<string> = new Set(),
): ModelToolReply {
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
    truncated = choice.finish_reason === "length" || choice.finish_reason === "content_filter";
    if (message.tool_calls != null && !Array.isArray(message.tool_calls))
      throw new ToolReplyValidationError("invalid_call_list", 0, truncated);
    text =
      typeof message.content === "string" ? message.content : textBlocks(message.content, "text");
    calls = list(message.tool_calls).map((v, index) => {
      const c = object(v),
        f = object(c.function);
      if (c.type !== "function")
        throw new ToolReplyValidationError(
          "unsupported_tool_type",
          list(message.tool_calls).length,
          truncated,
          index,
        );
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
  if (calls.length > 8)
    throw new ToolReplyValidationError("too_many_calls", calls.length, truncated);
  const seen = new Set<string>();
  for (const [index, call] of calls.entries()) {
    const issue: ToolReplyIssue | undefined =
      call.id == null || call.id === ""
        ? "missing_call_id"
        : typeof call.id !== "string" || !call.id.trim() || call.id.length > 200
          ? "invalid_call_id"
          : call.name == null || call.name === ""
            ? "missing_tool_name"
            : typeof call.name !== "string" || !call.name.trim() || call.name.length > 100
              ? "invalid_tool_name"
              : seen.has(call.id)
                ? "duplicate_call_id"
                : usedIds.has(call.id)
                  ? "reused_call_id"
                  : undefined;
    if (issue) throw new ToolReplyValidationError(issue, calls.length, truncated, index);
    seen.add(call.id);
  }
  if (calls.length && truncated)
    throw new ToolReplyValidationError("truncated_calls", calls.length, true);
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
  recovery?: ToolReplyRecovery,
) {
  const deadline = Date.now() + timeoutMs;
  validateModelBaseUrl(env, model.baseUrl);
  const usedIds = new Set(rounds.flatMap((r) => r.results.map((v) => v.id)));
  for (;;) {
    const target = recovery?.state.pending
      ? { ...model, systemPrompt: model.systemPrompt + "\n\n" + TOOL_REPLY_CORRECTION }
      : model;
    const body = fitToolRequest(target, messages, tools, rounds, output, allowTools, resultLimit);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new DOMException("Model request timed out", "TimeoutError");
    // Request/HTTP failures are not format errors and must never trigger this retry.
    const raw = await requestModel(env, target, key, body, output, remaining, true);
    try {
      const reply = parseToolReply(model.protocol, raw, usedIds);
      // The caller persists this transition together with the accepted reply,
      // before executing tools or awaiting another checkpoint.
      if (recovery) recovery.state.pending = false;
      return reply;
    } catch (error) {
      if (!(error instanceof ToolReplyValidationError)) throw error;
      const retry =
        !!recovery &&
        !recovery.state.used &&
        !recovery.state.pending &&
        !error.truncated &&
        deadline - Date.now() >= 1000;
      console.warn(
        JSON.stringify({
          event: "llm.tool_reply_rejected",
          protocol: model.protocol,
          code: error.code,
          issue: error.issue,
          callCount: error.callCount,
          callIndex: error.callIndex,
          truncated: error.truncated,
          retry,
        }),
      );
      if (!retry || !recovery) throw error;
      // Consume/persist the per-turn allowance before awaiting anything. Retain
      // only previously accepted rounds; rejected calls never get tool results.
      recovery.state.used = true;
      recovery.state.pending = true;
      await recovery.checkpoint();
      if (deadline - Date.now() < 1000) throw error;
    }
  }
}
