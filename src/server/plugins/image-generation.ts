import { z } from "zod";
import type { Assistant } from "../../shared/types";
import { imageGenerationManifest, type ImageGenerationPlugin } from "../../shared/image-generation";
import { IMAGE_CREDITS, type PluginInvocation } from "../../shared/plugins";
import { apiEndpoint } from "../../shared/model-endpoint";
import { AppError, MODEL_REQUEST_TIMEOUT_MS } from "../config";
import { validateModelBaseUrl, validateModelDNS, validatePublicDNS, readJson } from "../security";
import { MAX_GENERATED_BYTES, MediaStore } from "../media";
import { publicPageUrl } from "./web-tools";
import { countPluginInput, invokePlugin } from "./gateway";
import { creditUnits } from "../wallet";
import { imageSizeFromPrompt } from "./image-size";
import { upstreamPaymentError } from "../upstream-error";

const imageResponse = z.object({
  data: z
    .array(
      z.object({
        url: z.string().max(12000).optional(),
        b64_json: z.string().max(12_000_000).optional(),
      }),
    )
    .length(1),
});

async function imageUpstreamError(response: Response, startedAt: number): Promise<AppError> {
  // Inspect only a bounded error body. Provider text can contain prompts or credentials;
  // never echo it to the user or write it verbatim to logs.
  const body = await readJson(response, 16_384).catch(() => null);
  const parsed = z
    .object({
      error: z.union([
        z.string(),
        z.object({ message: z.string().optional(), code: z.string().optional() }),
      ]),
    })
    .safeParse(body);
  const detail = parsed.success
    ? typeof parsed.data.error === "string"
      ? parsed.data.error
      : `${parsed.data.error.code ?? ""} ${parsed.data.error.message ?? ""}`
    : "";
  let reason = "unknown";
  let message = `生图请求未成功（${response.status}），请检查渠道配置或稍后重试`;
  if (response.status === 401 || response.status === 403) {
    reason = "authentication";
    message = "生图服务鉴权失败，请检查渠道 API Key 和模型权限";
  } else if (response.status === 404) {
    reason = "not_found";
    message = "生图接口或模型不存在，请确认渠道支持 /v1/images/generations";
  } else if (/insufficient[_ ](?:quota|balance)|余额不足|额度不足/i.test(detail)) {
    reason = "quota";
    message = "上游生图服务余额或额度不足，请检查渠道账户";
  } else if (response.status === 429) {
    reason = "rate_limit";
    message = "上游生图服务请求过于频繁，请稍后重试";
  } else if (/upstream.*invalid response/i.test(detail)) {
    reason = "invalid_response";
    message = `上游生图服务返回了无效响应（${response.status}），请稍后重试或更换渠道`;
  } else if (response.status >= 500) {
    reason = "unavailable";
    message = `上游生图服务暂时异常（${response.status}），请稍后重试或更换渠道`;
  } else if (response.status === 400 || response.status === 422) {
    reason = "invalid_request";
    message = `生图服务未接受请求（${response.status}），请检查模型是否支持生图、所需尺寸及提示词要求`;
  }
  const requestId = response.headers.get("x-request-id") || response.headers.get("request-id");
  console.warn(
    JSON.stringify({
      event: "image.upstream_failed",
      status: response.status,
      reason,
      elapsedMs: Date.now() - startedAt,
      ...(requestId && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId)
        ? { requestId }
        : {}),
    }),
  );
  return new AppError("image_upstream", `${message}；本次未扣 credits`, 502, response.status);
}

export async function fetchGeneratedBytes(url: string, signal: AbortSignal): Promise<Uint8Array> {
  for (let redirects = 0; redirects <= 3; redirects++) {
    url = publicPageUrl(url);
    await validatePublicDNS(url);
    signal.throwIfAborted();
    // Never forward the model API credential to image URLs or redirect targets.
    const r = await fetch(url, { redirect: "manual", signal });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const target = r.headers.get("location");
      await r.body?.cancel();
      if (!target) break;
      url = new URL(target, url).toString();
      continue;
    }
    if (!r.ok || !r.body) {
      await r.body?.cancel();
      break;
    }
    const reader = r.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_GENERATED_BYTES)
          throw new AppError("image_size", "生成图片超过 8 MB，请调整尺寸后重试", 502);
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  }
  throw new AppError("image_download", "生成图片下载失败，本次未扣费，请稍后重试", 502);
}
export async function invokeImageGeneration(
  env: Env,
  model: Assistant,
  key: string,
  config: ImageGenerationPlugin,
  prompt: string,
  runId: string,
  sessionId: string | null,
  deadline: number,
  store: MediaStore,
  checkpoint: () => void,
  onPending?: () => Promise<void>,
) {
  if (!prompt.trim() || prompt.length > 20000)
    throw new AppError("image_prompt", "请提供 1–20000 字的画面描述");
  const size = imageSizeFromPrompt(prompt);
  const request: PluginInvocation = {
    protocolVersion: "1.0",
    runId,
    sessionId,
    instanceId: config.id,
    pluginId: config.pluginId,
    pluginVersion: imageGenerationManifest.version,
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    limits: {
      inputTokens: model.maxInputTokens,
      outputTokens: 1,
      outputImages: 1,
      creditUnits: model.maxCredits ? Math.floor(model.maxCredits * 1000) : null,
    },
  };
  // No generated text is requested; the one-token ceiling satisfies the generic protocol.
  const minimum = creditUnits(countPluginInput(request), 0) + IMAGE_CREDITS * 1000;
  if (request.limits.creditUnits !== null && minimum > request.limits.creditUnits)
    throw new AppError(
      "budget_too_small",
      "单次 credits 上限不足：每张图片 5 credits，另计描述文字，请提高模型的单次上限",
      422,
    );
  let assetId = "";
  const result = await invokePlugin(
    request,
    async () => {
      const endpoint = apiEndpoint(
        validateModelBaseUrl(env, model.baseUrl),
        "/v1/images/generations",
      );
      await validateModelDNS(env, endpoint);
      checkpoint();
      if (deadline - Date.now() < 1000)
        throw new AppError("image_timeout", "生图请求已超时，请稍后重试", 504);
      await onPending?.();
      checkpoint();
      const remaining = Math.min(MODEL_REQUEST_TIMEOUT_MS, deadline - Date.now());
      if (remaining < 1000) throw new AppError("image_timeout", "生图请求已超时，请稍后重试", 504);
      const signal = AbortSignal.timeout(remaining);
      const startedAt = Date.now();
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        // Explicit prompt ratios control the canvas. Omit size for unspecified ratios.
        body: JSON.stringify({ model: model.model, prompt, n: 1, ...(size ? { size } : {}) }),
        redirect: "manual",
        signal,
      });
      if (!r.ok) {
        const paymentError = upstreamPaymentError(env, model.baseUrl, r.status);
        if (paymentError) {
          await r.body?.cancel();
          throw paymentError;
        }
        throw await imageUpstreamError(r, startedAt);
      }
      const parsed = imageResponse.safeParse(await readJson(r, 12_000_000));
      if (!parsed.success)
        throw new AppError(
          "image_response",
          "生图接口需要返回一张图片的 data.url 或 data.b64_json，本次未扣费",
          502,
        );
      const item = parsed.data.data[0];
      let bytes: Uint8Array;
      if (item.b64_json) {
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(item.b64_json))
          throw new AppError("image_base64", "上游图片编码无效", 502);
        bytes = Buffer.from(item.b64_json, "base64");
      } else if (item.url) bytes = await fetchGeneratedBytes(item.url, signal);
      else throw new AppError("image_missing", "上游没有返回图片，本次未扣费", 502);
      checkpoint();
      const asset = await store.save(runId, sessionId, bytes);
      assetId = asset.id;
      checkpoint();
      return {
        protocolVersion: "1.0",
        runId,
        status: "completed",
        content: [{ type: "image", assetId }],
      };
    },
    (id, run) => store.resolve(id, run),
  );
  return { ...result.meter, assetId, truncated: false, estimated: false };
}
