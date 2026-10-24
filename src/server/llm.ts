import { activityFetch, executionId, executionSignal } from "./execution-context";
import { z } from "zod";
import type { Assistant, Protocol } from "../shared/types";
import { modelEndpoint } from "../shared/model-endpoint";
import { modelProtocolIssue } from "../shared/model-compatibility";
import { AppError, MODEL_REQUEST_TIMEOUT_MS } from "./config";
import { upstreamPaymentError } from "./upstream-error";
import { readJson, validateModelBaseUrl, validateModelDNS } from "./security";
import {
  DEFAULT_CONTEXT_TOKENS,
  DEFAULT_INPUT_TOKENS,
  DEFAULT_OUTPUT_TOKENS,
  MAX_CONTEXT_TOKENS,
} from "../shared/context";
export type ModelMessage = {
  role: "user" | "assistant";
  content: string;
  image?: { mime: string; data: string };
  images?: { mime: string; data: string }[];
};
export const modelImages = (m: ModelMessage) => m.images ?? (m.image ? [m.image] : []);
export const assistantSchema = z.object({
  kind: z.enum(["text", "image", "other"]).optional(),
  name: z.string().trim().min(1).max(40),
  description: z.string().max(160).default(""),
  protocol: z.enum(["chat-completions", "responses", "anthropic"]),
  baseUrl: z.string().max(500),
  model: z.string().trim().min(1).max(120),
  systemPrompt: z.string().max(12000).default("你是一个友好、可靠的助手。请用清晰简洁的中文回答。"),
  shortcut: z
    .string()
    .trim()
    .max(24)
    .regex(/^[\p{L}\p{N}_-]*$/u)
    .default(""),
  apiKey: z.string().max(2000).optional(),
  maxInputTokens: z.number().int().min(512).max(MAX_CONTEXT_TOKENS).default(DEFAULT_INPUT_TOKENS),
  maxOutputTokens: z.number().int().min(64).max(8192).default(DEFAULT_OUTPUT_TOKENS),
  contextTokens: z.number().int().min(512).max(MAX_CONTEXT_TOKENS).default(DEFAULT_CONTEXT_TOKENS),
  // Zero disables the optional per-turn spending limit. Existing saved limits are retained.
  maxCredits: z.number().min(0).max(1000).default(0),
  color: z.enum(["sage", "blue", "peach", "lavender"]).default("sage"),
});
export const channelSchema = assistantSchema.pick({
  name: true,
  description: true,
  protocol: true,
  baseUrl: true,
  apiKey: true,
  color: true,
});
export const modelSchema = assistantSchema
  .omit({ protocol: true, baseUrl: true, apiKey: true })
  .extend({
    channelId: z.string().trim().min(1).max(100),
  });
export function assertModelProtocol(model: Assistant) {
  const issue = modelProtocolIssue(model);
  if (issue) throw new AppError("model_protocol", issue, 422);
}
const object = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const estimateTokens = (text: string) =>
  Math.ceil(new TextEncoder().encode(text).length / 3) + 8;
export class ContextLimitError extends AppError {
  constructor(public window?: number) {
    super(
      "context_length_exceeded",
      "模型的上下文已超限，请在模型设置中确认实际窗口大小，或使用 /new 开始新会话",
      422,
    );
  }
}
export class UnsupportedToolsError extends AppError {
  constructor() {
    super("tools_unsupported", "当前上游不支持工具调用", 422);
  }
}
function rejectsTools(raw: unknown) {
  const error = object(object(raw).error);
  const message = typeof error.message === "string" ? error.message : "";
  const param = String(error.param ?? "");
  // A schema error, auth failure, timeout or malformed response is NOT evidence
  // of missing tool support. Only explicit capability/parameter rejections count.
  if (
    (param && !["tools", "tool_choice"].includes(param)) ||
    /\b(?:schema|strict|additionalProperties)\b/i.test(message)
  )
    return false;
  return (
    /^(unsupported_tools|tool_use_not_supported|function_calling_not_supported)$/.test(
      String(error.code ?? ""),
    ) ||
    (/\b(?:tools|tool_choice|tool use|tool calling|function calling)\b/i.test(
      message + " " + param,
    ) &&
      /(?:not support|unsupported|not available|not enabled|unknown (?:parameter|field)|unrecognized (?:parameter|field)|unexpected (?:parameter|field))/i.test(
        message,
      ))
  );
}
// Read only recognized validation errors. Never expose upstream text or retry auth/rate failures.
export function contextLimitError(raw: unknown): ContextLimitError | null {
  const error = object(object(raw).error);
  const code = String(error.code ?? error.type ?? "");
  const message = typeof error.message === "string" ? error.message : "";
  if (
    !/^(context_length_exceeded|max_context_length_exceeded|prompt_too_long)$/.test(code) &&
    !/(?:maximum context length|context (?:window|length).*(?:exceed|too (?:long|large))|prompt is too long|input (?:is too long|tokens? exceed)|exceeds? the context window)/i.test(
      message,
    )
  )
    return null;
  const match =
    message.match(/maximum context length is\s*([\d,]+)/i) ??
    message.match(/>\s*([\d,]+)\s*(?:maximum|max\b)/i);
  const window = match ? Number(match[1].replaceAll(",", "")) : undefined;
  return new ContextLimitError(
    window && window >= 512 && window <= MAX_CONTEXT_TOKENS ? window : undefined,
  );
}
export function buildRequest(assistant: Assistant, messages: ModelMessage[], maxOutput: number) {
  const url = modelEndpoint(assistant.baseUrl, assistant.protocol);
  const common = { model: assistant.model, stream: false };
  if (assistant.protocol === "anthropic")
    return {
      url,
      body: {
        ...common,
        system: assistant.systemPrompt,
        max_tokens: maxOutput,
        messages: messages.map((m) => ({
          role: m.role,
          content: modelImages(m).length
            ? [
                ...modelImages(m).map((image) => ({
                  type: "image",
                  source: { type: "base64", media_type: image.mime, data: image.data },
                })),
                { type: "text", text: m.content },
              ]
            : m.content,
        })),
      },
    };
  if (assistant.protocol === "responses")
    return {
      url,
      body: {
        ...common,
        instructions: assistant.systemPrompt,
        max_output_tokens: maxOutput,
        store: false,
        input: messages.map((m) => ({
          role: m.role,
          content: modelImages(m).length
            ? [
                { type: "input_text", text: m.content },
                ...modelImages(m).map((image) => ({
                  type: "input_image",
                  image_url: `data:${image.mime};base64,${image.data}`,
                  detail: "auto",
                })),
              ]
            : m.content,
        })),
      },
    };
  return {
    url,
    body: {
      ...common,
      max_completion_tokens: maxOutput,
      messages: [
        { role: "system", content: assistant.systemPrompt },
        ...messages.map((m) => ({
          role: m.role,
          content: modelImages(m).length
            ? [
                { type: "text", text: m.content },
                ...modelImages(m).map((image) => ({
                  type: "image_url",
                  image_url: { url: `data:${image.mime};base64,${image.data}` },
                })),
              ]
            : m.content,
        })),
      ],
    },
  };
}
export function parseReply(protocol: Protocol, data: unknown) {
  const response = object(data);
  let text = "";
  const contextError = contextLimitError(data);
  if (contextError) throw contextError;
  if (response.error || response.status === "failed")
    throw new AppError("model_failed", "模型服务未能完成请求，请检查配置或稍后重试", 502);
  if (protocol === "chat-completions") {
    const m = object(object(list(response.choices)[0]).message);
    text =
      typeof m.content === "string"
        ? m.content
        : list(m.content)
            .map((p) => object(p).text ?? "")
            .join("");
  } else if (protocol === "responses")
    text = list(response.output)
      .flatMap((o) => list(object(o).content))
      .filter((p) => object(p).type === "output_text")
      .map((p) => object(p).text ?? "")
      .join("\n");
  else
    text = list(response.content)
      .filter((p) => object(p).type === "text")
      .map((p) => object(p).text ?? "")
      .join("\n");
  if (!text.trim())
    throw new AppError("empty_reply", "模型没有返回文字回复，请检查模型或提高回复长度上限", 502);
  return { text: text.slice(0, 50000) };
}
export async function callModel(
  env: Env,
  assistant: Assistant,
  apiKey: string,
  messages: ModelMessage[],
  maxOutput = assistant.maxOutputTokens,
  timeoutMs = MODEL_REQUEST_TIMEOUT_MS,
) {
  validateModelBaseUrl(env, assistant.baseUrl);
  const request = buildRequest(assistant, messages, maxOutput);
  return parseReply(
    assistant.protocol,
    await requestModel(env, assistant, apiKey, request.body, maxOutput, timeoutMs),
  );
}

// Shared transport: native tool calls retain the exact same destination checks,
// credential isolation, response size limit and request deadline as plain chat.
export async function requestModel(
  env: Env,
  assistant: Assistant,
  apiKey: string,
  body: object,
  maxOutput: number,
  timeoutMs: number,
  toolRequest = false,
) {
  assertModelProtocol(assistant);
  const startedAt = Date.now();
  const signal = executionSignal(Math.max(1, Math.min(MODEL_REQUEST_TIMEOUT_MS, timeoutMs)));
  validateModelBaseUrl(env, assistant.baseUrl);
  if (!executionId()) await validateModelDNS(env, assistant.baseUrl);
  const validatedAt = Date.now();
  let attempts = 1;
  signal.throwIfAborted();
  const url = modelEndpoint(assistant.baseUrl, assistant.protocol);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (assistant.protocol === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else headers.authorization = `Bearer ${apiKey}`;
  const send = (body: object) =>
    activityFetch(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        redirect: "manual",
        signal,
      },
      timeoutMs,
    );
  let response = await send(body);
  let failure: Record<string, unknown> | undefined;
  // Older compatible providers reject the newer limit before running inference.
  // Retry only this explicit validation error, sharing the original time budget.
  if (response.status === 400 && assistant.protocol === "chat-completions") {
    failure = object(await readJson(response, 64_000).catch(() => ({})));
    const error = object(failure.error);
    const message = typeof error.message === "string" ? error.message : "";
    if (
      (error.param === "max_completion_tokens" || message.includes("max_completion_tokens")) &&
      /unsupported|not supported|unknown|unrecognized|unexpected|not allowed/i.test(message)
    ) {
      const legacyBody: Record<string, unknown> = { ...body, max_tokens: maxOutput };
      delete legacyBody.max_completion_tokens;
      attempts++;
      response = await send(legacyBody);
      failure = undefined;
    }
  }
  if (!response.ok) {
    if ([400, 413, 422].includes(response.status)) {
      failure ??= object(await readJson(response, 64_000).catch(() => ({})));
      const contextError = contextLimitError(failure);
      if (contextError) throw contextError;
      if (toolRequest && [400, 422].includes(response.status) && rejectsTools(failure))
        throw new UnsupportedToolsError();
    } else await response.body?.cancel();
    if (response.status >= 300 && response.status < 400)
      throw new AppError(
        "model_redirect",
        "模型服务返回了跳转，请将服务地址改为供应商提供的最终 API 地址",
        502,
      );
    const paymentError = upstreamPaymentError(env, assistant.baseUrl, response.status);
    if (paymentError) throw paymentError;
    throw new AppError(
      "model_http_error",
      response.status === 404
        ? "模型服务返回 404，请检查渠道 Base URL、接口协议和模型 ID 是否匹配服务商文档"
        : `模型服务返回 ${response.status}，请检查 Key、模型名称和余额`,
      502,
      response.status,
    );
  }
  // Untrusted upstream usage is deliberately never passed into the billing path.
  const result = await readJson(response);
  // Timings only: prompts, keys, provider URLs and user/model identifiers stay private.
  console.info(
    JSON.stringify({
      event: "llm.request_completed",
      protocol: assistant.protocol,
      toolRequest,
      dnsMs: validatedAt - startedAt,
      upstreamMs: Date.now() - validatedAt,
      durationMs: Date.now() - startedAt,
      attempts,
    }),
  );
  return result;
}
