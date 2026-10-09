import {
  BILLING_POLICY_VERSION,
  IMAGE_CREDITS,
  TOKENIZER_VERSION,
  pluginInvocationSchema,
  pluginResultSchema,
  type PlatformMeter,
  type PluginInvocation,
  type PluginResult,
} from "../../shared/plugins";
import { TOKENS_PER_CREDIT, OUTPUT_TOKEN_WEIGHT } from "../../shared/credits";
import { AppError } from "../config";
import { countTextTokens, limitTextTokens } from "../tokenizer";
import { creditUnits } from "../wallet";

export function countPluginInput(request: PluginInvocation) {
  return request.messages.reduce(
    (total, message) =>
      total +
      countTextTokens(
        message.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join(""),
      ),
    0,
  );
}

export function pluginOutputBudget(
  request: PluginInvocation,
  inputTokens = countPluginInput(request),
) {
  if (inputTokens > request.limits.inputTokens)
    throw new AppError(
      "input_limit_exceeded",
      "输入超过平台 Token 上限，请缩短内容或提高输入上限",
      422,
    );
  const cap = request.limits.creditUnits;
  if (cap !== null && creditUnits(inputTokens, 0) > cap)
    throw new AppError(
      "budget_too_small",
      "当前输入超过单轮 credits 上限，请调整上限或开始新会话",
      422,
    );
  return cap === null
    ? request.limits.outputTokens
    : Math.min(
        request.limits.outputTokens,
        Math.floor((cap * TOKENS_PER_CREDIT - inputTokens * 1000) / (OUTPUT_TOKEN_WEIGHT * 1000)),
      );
}

// The resolver is platform code. Its result must come from a verified, persisted asset
// belonging to this account and run. Third-party result fields are never proof of an image.
export type ResolveOutputAsset = (
  assetId: string,
  runId: string,
) => Promise<{
  assetId: string;
  runId: string;
  kind: "image" | "file";
  ready: boolean;
} | null>;

export async function invokePlugin(
  rawRequest: PluginInvocation,
  execute: (request: PluginInvocation) => Promise<unknown>,
  resolveAsset?: ResolveOutputAsset,
): Promise<{ result: PluginResult; meter: PlatformMeter; truncated: boolean }> {
  const request = pluginInvocationSchema.parse(rawRequest);
  const inputTokens = countPluginInput(request);
  pluginOutputBudget(request, inputTokens);
  // Keep platform billing input independent of mutations inside a built-in adapter.
  const rawResult = await execute(structuredClone(request));
  const result = pluginResultSchema.parse(rawResult);
  if (result.runId !== request.runId)
    throw new AppError("plugin_run_mismatch", "插件返回的任务标识不匹配", 502);
  const assets = new Set<string>();
  let outputImages = 0;
  for (const block of result.content) {
    if (block.type === "text" || assets.has(block.assetId)) continue;
    const asset = await resolveAsset?.(block.assetId, request.runId);
    if (
      !asset?.ready ||
      asset.runId !== request.runId ||
      asset.assetId !== block.assetId ||
      asset.kind !== block.type
    )
      throw new AppError("plugin_asset_unverified", "插件附件尚未通过平台校验", 502);
    assets.add(block.assetId);
    if (asset.kind === "image") outputImages++;
  }
  if (outputImages > request.limits.outputImages)
    throw new AppError("plugin_image_limit", "插件返回的图片数量超过上限", 502);
  const imageUnits = outputImages * IMAGE_CREDITS * 1000;
  const cap = request.limits.creditUnits;
  if (cap !== null && creditUnits(inputTokens, 0) + imageUnits > cap)
    throw new AppError("budget_too_small", "结果图片超过单轮 credits 上限", 422);
  const maxOutput = pluginOutputBudget(
    {
      ...request,
      limits: {
        ...request.limits,
        creditUnits: cap === null ? null : cap - imageUnits,
      },
    },
    inputTokens,
  );
  // Concatenate text once: splitting a reply into arbitrary blocks cannot change its bill.
  const text = result.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const finalText = limitTextTokens(text, maxOutput);
  if (!finalText.trim() && !assets.size)
    throw new AppError("plugin_empty_result", "插件没有返回可用结果，本次未扣费", 502);
  const outputTokens = countTextTokens(finalText);
  const seen = new Set<string>();
  return {
    result: {
      ...result,
      content: [
        ...(finalText ? [{ type: "text" as const, text: finalText }] : []),
        ...result.content.filter((b) => {
          if (b.type === "text" || seen.has(b.assetId)) return false;
          seen.add(b.assetId);
          return true;
        }),
      ],
    },
    meter: {
      policyVersion: BILLING_POLICY_VERSION,
      tokenizerVersion: TOKENIZER_VERSION,
      inputTokens,
      outputTokens,
      outputImages,
      units: creditUnits(inputTokens, outputTokens) + imageUnits,
    },
    truncated: finalText !== text,
  };
}
